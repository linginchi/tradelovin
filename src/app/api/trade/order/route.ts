import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { awardPoints, TQ_POINTS_RULES } from "@/lib/membership/points";
import { placeLimitOrderService } from "@/lib/trade/place-limit-order";
import { getInstrumentRule } from "@/lib/trade/instrument-rules";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	side?: unknown;
	price?: unknown;
	quantity?: unknown;
	orderType?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}
	const membership = await requireMembershipCapability(auth.supabase, auth.userId, "sim_trading");
	if (membership instanceof NextResponse) {
		return membership;
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const symbolRaw = typeof body.symbol === "string" ? body.symbol.trim() : "";
	const sideRaw = typeof body.side === "string" ? body.side.trim().toLowerCase() : "";
	const price = typeof body.price === "number" ? body.price : Number(body.price);
	const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
	const orderTypeRaw = typeof body.orderType === "string" ? body.orderType.trim().toLowerCase() : "limit";

	if (!symbolRaw) {
		return NextResponse.json({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	if (sideRaw !== "buy" && sideRaw !== "sell") {
		return NextResponse.json({ success: false, error: "side 须为 buy 或 sell" }, { status: 400 });
	}
	if (!Number.isFinite(price) || price <= 0) {
		return NextResponse.json({ success: false, error: "price 须大于 0" }, { status: 400 });
	}
	if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
		return NextResponse.json({ success: false, error: "quantity 须为正整数" }, { status: 400 });
	}
	if (!["limit", "stop_loss", "market_limited"].includes(orderTypeRaw)) {
		return NextResponse.json({ success: false, error: "orderType 不支持" }, { status: 400 });
	}
	if (orderTypeRaw !== "limit") {
		const advanced = await requireMembershipCapability(auth.supabase, auth.userId, "advanced_order_bundle");
		if (advanced instanceof NextResponse) {
			return advanced;
		}
		return NextResponse.json(
			{ success: false, error: "高级下单指令正在规划中", code: "ADVANCED_ORDER_PLANNED" },
			{ status: 501 },
		);
	}
	const rule = getInstrumentRule(symbolRaw);
	if (quantity % rule.lotSize !== 0) {
		return NextResponse.json(
			{ success: false, error: `quantity 须为 ${rule.lotSize} 的整数倍` },
			{ status: 400 },
		);
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json(
			{ success: false, error: "交易服务不可用（缺少 SUPABASE_SERVICE_ROLE_KEY）" },
			{ status: 503 },
		);
	}

	const result = await placeLimitOrderService(srv, auth.userId, {
		symbolRaw,
		limitPrice: price,
		quantity,
		side: sideRaw as "buy" | "sell",
	});
	if (result.status < 400 && result.body?.success === true) {
		await awardPoints(srv, {
			userId: auth.userId,
			source: TQ_POINTS_RULES.simTradeQualified.source,
			delta: TQ_POINTS_RULES.simTradeQualified.points,
			dailyCap: TQ_POINTS_RULES.simTradeQualified.dailyCap,
			metadata: { trigger: "place_order", symbol: symbolRaw },
		});
	}
	return NextResponse.json(result.body, { status: result.status });
}
