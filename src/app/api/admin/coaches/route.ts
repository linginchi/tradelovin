import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getTradeUserIdByEmail } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email(),
	isCoach: z.boolean(),
});

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	const { data, error } = await supabase
		.from("profiles")
		.select("id, real_name, nickname, is_coach")
		.eq("is_coach", true)
		.order("real_name", { ascending: true });
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	return NextResponse.json({
		success: true,
		data: (data ?? []).map((row) => ({
			id: row.id as string,
			name: ((row.real_name ?? row.nickname) as string) || "—",
			is_coach: true,
		})),
	});
}

export async function POST(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "请填写合法邮箱" }, { status: 400 });
	}
	const userId = await getTradeUserIdByEmail(supabase, parsed.data.email.trim().toLowerCase());
	if (!userId) {
		return NextResponse.json({ success: false, error: "找不到该邮箱对应的账号" }, { status: 404 });
	}
	const { data: updated, error } = await supabase
		.from("profiles")
		.update({ is_coach: parsed.data.isCoach })
		.eq("id", userId)
		.select("id");
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 400 });
	}
	if (!updated?.length) {
		const { error: insertErr } = await supabase.from("profiles").insert({
			id: userId,
			is_coach: parsed.data.isCoach,
			role: "user",
		});
		if (insertErr) {
			return NextResponse.json({ success: false, error: insertErr.message }, { status: 400 });
		}
	}
	return NextResponse.json({ success: true, data: { userId, isCoach: parsed.data.isCoach } });
}
