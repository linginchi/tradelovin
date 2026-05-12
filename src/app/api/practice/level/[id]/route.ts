import { NextResponse } from "next/server";

import { getPracticeLevel } from "@/lib/practice/levels";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type Params = {
	params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const { id } = await params;
	const level = getPracticeLevel(id);
	if (!level) {
		return NextResponse.json({ success: false, error: "关卡不存在" }, { status: 404 });
	}
	return NextResponse.json({ success: true, level });
}
