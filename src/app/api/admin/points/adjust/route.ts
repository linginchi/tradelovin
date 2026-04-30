import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { adjustPoints } from "@/lib/membership/points";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
	userId: z.string().uuid(),
	delta: z.number().int().refine((v) => v !== 0, "delta 不能为 0"),
	reason: z.string().min(1).max(200),
});

export async function POST(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) {
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
		return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
	}

	try {
		const result = await adjustPoints(srv, {
			userId: parsed.data.userId,
			source: "admin_adjust",
			delta: parsed.data.delta,
			referenceId: "admin_manual_adjust",
			metadata: { reason: parsed.data.reason, operatorEmail: gated.session.email },
		});
		return NextResponse.json({ success: true, data: result });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "调整失败" },
			{ status: 400 },
		);
	}
}
