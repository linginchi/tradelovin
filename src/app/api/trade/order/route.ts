import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	side?: unknown;
	price?: unknown;
	quantity?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
	const side = typeof body.side === "string" ? body.side.trim().toLowerCase() : "";
	const price = typeof body.price === "number" ? body.price : Number(body.price);
	const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);

	if (!symbol) {
		return NextResponse.json({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	if (side !== "buy" && side !== "sell") {
		return NextResponse.json({ success: false, error: "side 须为 buy 或 sell" }, { status: 400 });
	}
	if (!Number.isFinite(price) || price <= 0) {
		return NextResponse.json({ success: false, error: "price 须大于 0" }, { status: 400 });
	}
	if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
		return NextResponse.json({ success: false, error: "quantity 须为正整数" }, { status: 400 });
	}
	if (quantity % 100 !== 0) {
		return NextResponse.json({ success: false, error: "quantity 须为 100 的整数倍" }, { status: 400 });
	}

	return NextResponse.json({
		success: false,
		message: "撮合引擎开发中，暂无法下单",
	});
}
