import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { randomInternalPassword } from "@/lib/auth/auto-register";
import {
	getAuthEmailByUserId,
	getAuthEmailsByUserIds,
	getTradeUserIdByEmail,
} from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	name: z.string().min(1),
	email: z.string().trim().email(),
	bio: z.string().nullable().optional(),
});

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("profiles")
		.select("id, real_name, nickname, avatar_url, bio, is_coach")
		.eq("role", "instructor")
		.order("created_at", { ascending: true });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const ids = (data ?? []).map((r) => r.id as string);
	const emailMap = await getAuthEmailsByUserIds(supabase, ids);

	const instructors = (data ?? []).map((row) => ({
		id: row.id as string,
		name: ((row.real_name ?? row.nickname) as string) || "—",
		email: emailMap.get(row.id as string) ?? null,
		avatar_url: (row.avatar_url as string | null) ?? null,
		bio: row.bio as string | null,
		is_coach: Boolean((row as { is_coach?: boolean }).is_coach),
	}));

	return NextResponse.json({ instructors });
}

export async function POST(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = postSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const emailLower = parsed.data.email.trim().toLowerCase();
	const displayName = parsed.data.name.trim();
	const profileBio = parsed.data.bio?.trim() || null;

	let userId = await getTradeUserIdByEmail(supabase, emailLower);
	if (!userId) {
		const { data: created, error: createErr } = await supabase.auth.admin.createUser({
			email: emailLower,
			password: randomInternalPassword(),
			email_confirm: true,
			user_metadata: {
				nickname: displayName,
				real_name: displayName,
				full_name: displayName,
			},
		});
		if (createErr || !created?.user?.id) {
			return NextResponse.json({ error: createErr?.message ?? "创建讲师账号失败" }, { status: 400 });
		}
		userId = created.user.id;
	}

	const { data: existing, error: existingErr } = await supabase
		.from("profiles")
		.select("id, role")
		.eq("id", userId)
		.maybeSingle();
	if (existingErr) {
		return NextResponse.json({ error: existingErr.message }, { status: 500 });
	}
	if (existing && (existing.role === "admin" || existing.role === "super_admin")) {
		return NextResponse.json({ error: "该邮箱为后台管理员，不能改为讲师" }, { status: 409 });
	}

	const { data, error } = await supabase
		.from("profiles")
		.upsert(
			{
				id: userId,
				real_name: displayName,
				nickname: displayName,
				bio: profileBio,
				role: "instructor",
			},
			{ onConflict: "id" },
		)
		.select("id, real_name, nickname, avatar_url, bio")
		.maybeSingle();
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const row = data as {
		id: string;
		real_name: string | null;
		nickname: string | null;
		avatar_url: string | null;
		bio: string | null;
	};

	const contactEmail = await getAuthEmailByUserId(supabase, row.id);

	return NextResponse.json({
		instructor: {
			id: row.id,
			name: row.real_name ?? row.nickname ?? "—",
			email: contactEmail ?? emailLower,
			avatar_url: row.avatar_url,
			bio: row.bio,
		},
	});
}
