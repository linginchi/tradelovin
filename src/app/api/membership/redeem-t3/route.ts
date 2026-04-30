import { NextResponse } from "next/server";
import { z } from "zod";

import { redeemT3ByPoints } from "@/lib/membership/manage";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
	planId: z.string().min(1),
});

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

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
		const redeemed = await redeemT3ByPoints(srv, auth.userId, parsed.data.planId);
		const membership = await getMembershipSnapshot(srv, auth.userId);
		return NextResponse.json({
			success: true,
			data: { redeemed, membership },
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "兑换失败" },
			{ status: 400 },
		);
	}
}
