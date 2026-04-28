import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailByUserId, getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	name: z.string().min(1),
	email: z.string().email().nullable().optional(),
	bio: z.string().nullable().optional(),
	specialties: z.array(z.string()).optional(),
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
		.select("id, full_name, nickname, avatar_url, bio, specialties")
		.eq("is_instructor", true)
		.order("created_at", { ascending: true });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const ids = (data ?? []).map((r) => r.id as string);
	const emailMap = await getAuthEmailsByUserIds(supabase, ids);

	const instructors = (data ?? []).map((row) => ({
		id: row.id as string,
		name: ((row.full_name ?? row.nickname) as string) || "—",
		email: emailMap.get(row.id as string) ?? null,
		avatar_url: (row.avatar_url as string | null) ?? null,
		bio: row.bio as string | null,
		specialties: (row.specialties as string[]) ?? [],
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

	const insert: Record<string, unknown> = {
		full_name: parsed.data.name.trim(),
		bio: parsed.data.bio?.trim() || null,
		specialties: parsed.data.specialties ?? [],
		is_instructor: true,
		role: "user",
	};
	const { data, error } = await supabase.from("profiles").insert(insert)
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const row = data as {
		id: string;
		full_name: string | null;
		nickname: string | null;
		avatar_url: string | null;
		bio: string | null;
		specialties: string[];
	};

	const contactEmail = await getAuthEmailByUserId(supabase, row.id);

	return NextResponse.json({
		instructor: {
			id: row.id,
			name: row.full_name ?? row.nickname ?? "—",
			email: contactEmail,
			avatar_url: row.avatar_url,
			bio: row.bio,
			specialties: row.specialties ?? [],
		},
	});
}
