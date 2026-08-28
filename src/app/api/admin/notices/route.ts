import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { validateCreateNotice } from "@/lib/notices/notices";
import { insertNotice } from "@/lib/notices/store";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	let raw: { userId?: unknown; title?: unknown; body?: unknown };
	try {
		raw = (await request.json()) as { userId?: unknown; title?: unknown; body?: unknown };
	} catch {
		return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const parsed = validateCreateNotice({
		userId: typeof raw.userId === "string" ? raw.userId : "",
		title: typeof raw.title === "string" ? raw.title : "",
		body: typeof raw.body === "string" ? raw.body : "",
	});
	if (!parsed.ok) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}

	const { data: userRow, error: userError } = await supabase.auth.admin.getUserById(parsed.userId);
	if (userError || !userRow.user) {
		return NextResponse.json({ error: "找不到该学员账号" }, { status: 404 });
	}

	try {
		const notice = await insertNotice(supabase, {
			userId: parsed.userId,
			title: parsed.title,
			body: parsed.body,
			createdBy: gated.session.email,
		});
		return NextResponse.json({ success: true, notice });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "发送失败" },
			{ status: 500 },
		);
	}
}
