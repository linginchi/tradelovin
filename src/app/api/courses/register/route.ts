import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
	courseId: z.string().uuid(),
});

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "无效的 courseId" }, { status: 400 });
	}

	const { data: course } = await srv
		.from("courses")
		.select("id")
		.eq("id", parsed.data.courseId)
		.eq("is_active", true)
		.maybeSingle();
	if (!course) {
		return NextResponse.json({ success: false, error: "课程不存在或未开放" }, { status: 404 });
	}

	const { error } = await srv.from("course_registrations").insert({
		user_id: user.id,
		course_id: parsed.data.courseId,
		status: "pending",
	});

	if (error) {
		if (error.code === "23505") {
			return NextResponse.json({ success: false, error: "您已报名过该课程" }, { status: 409 });
		}
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({ success: true, message: "报名已提交，等待审核。" });
}
