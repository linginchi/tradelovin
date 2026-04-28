import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	target_company?: unknown;
	target_role?: unknown;
	salary_expectation?: unknown;
	location_preference?: unknown;
	note?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	if (!user) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const fields = {
		target_company: typeof body.target_company === "string" ? body.target_company.trim() || null : null,
		target_role: typeof body.target_role === "string" ? body.target_role.trim() || null : null,
		salary_expectation:
			typeof body.salary_expectation === "string" ? body.salary_expectation.trim() || null : null,
		location_preference:
			typeof body.location_preference === "string" ? body.location_preference.trim() || null : null,
		note: typeof body.note === "string" ? body.note.trim() || null : null,
		updated_at: new Date().toISOString(),
	};

	const existed = await srv.from("career_applications").select("id").eq("user_id", user.id).maybeSingle();
	if ((existed.data as { id?: string })?.id) {
		const { error } = await srv.from("career_applications").update(fields).eq("user_id", user.id);
		if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	} else {
		const { error } = await srv.from("career_applications").insert({
			user_id: user.id,
			...fields,
			status: "pending" as const,
		});
		if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({ success: true, message: "已提交求职意向，等待审核。" });
}
