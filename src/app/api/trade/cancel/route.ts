import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function POST() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	return NextResponse.json({
		success: false,
		message: "撤单功能开发中",
	});
}
