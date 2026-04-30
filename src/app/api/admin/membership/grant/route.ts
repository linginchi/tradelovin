import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { grantMembershipByAdmin } from "@/lib/membership/manage";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
	userId: z.string().uuid(),
	tier: z.enum(["T2", "T3"]),
	months: z.number().int().positive().max(36).optional(),
	note: z.string().max(200).optional(),
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
		const result = await grantMembershipByAdmin(srv, {
			userId: parsed.data.userId,
			tier: parsed.data.tier,
			months: parsed.data.months,
			source: "manual",
			note: parsed.data.note,
		});
		const membership = await getMembershipSnapshot(srv, parsed.data.userId);
		return NextResponse.json({ success: true, data: { result, membership } });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "开通失败" },
			{ status: 400 },
		);
	}
}
