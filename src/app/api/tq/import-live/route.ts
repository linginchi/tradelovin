import { NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";

import { getServiceSupabase } from "@/lib/supabase/service";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

export const runtime = "nodejs";

type LiveTradeItem = {
	userId: string;
	symbol: string;
	side: "buy" | "sell";
	price: number;
	quantity: number;
	commission?: number;
	stampTax?: number;
	tradeTime?: string;
	source?: string;
	externalTradeId?: string;
};

type Body = { trades?: LiveTradeItem[] };

function extractApiKey(request: Request): string {
	return (
		request.headers.get("x-tq-api-key") ??
		request.headers.get("x-api-key") ??
		request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
		""
	);
}

function hashPayload(payload: string): string {
	return createHash("sha256").update(payload).digest("hex");
}

function verifySignature(rawBody: string, request: Request): boolean {
	const secret = process.env.TQ_IMPORT_LIVE_SIGNING_SECRET;
	if (!secret) return true;
	const ts = request.headers.get("x-tq-timestamp") ?? "";
	const sig = request.headers.get("x-tq-signature") ?? "";
	if (!ts || !sig) return false;
	const tsInt = Number(ts);
	if (!Number.isFinite(tsInt)) return false;
	const now = Date.now();
	if (Math.abs(now - tsInt) > 5 * 60 * 1000) return false;
	const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
	return sig === expected;
}

export async function POST(request: Request) {
	const expected = process.env.TQ_IMPORT_LIVE_API_KEY;
	if (!expected) {
		return NextResponse.json({ success: false, error: "TQ API Key 未配置" }, { status: 503 });
	}
	const provided = extractApiKey(request);
	if (!provided || provided !== expected) {
		return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
	}
	const rawBody = await request.text();
	if (!verifySignature(rawBody, request)) {
		return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: Body;
	try {
		body = JSON.parse(rawBody) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}
	const requestId = request.headers.get("x-idempotency-key") ?? "";
	if (!requestId) {
		return NextResponse.json({ success: false, error: "缺少 x-idempotency-key" }, { status: 400 });
	}
	const payloadHash = hashPayload(rawBody);
	const reqInsert = await srv.from("tq_live_import_requests").insert({
		request_id: requestId,
		payload_hash: payloadHash,
		source: "live_api",
	});
	if (reqInsert.error) {
		if (reqInsert.error.code === "23505") {
			return NextResponse.json({ success: true, imported: 0, duplicated: true, requestId });
		}
		return NextResponse.json({ success: false, error: reqInsert.error.message }, { status: 500 });
	}
	const trades = body.trades ?? [];
	if (!Array.isArray(trades) || trades.length === 0) {
		return NextResponse.json({ success: false, error: "trades 不能为空" }, { status: 400 });
	}

	const accountByUser = new Map<string, string>();
	for (const row of trades) {
		const userId = String(row.userId ?? "");
		if (!userId) continue;
		if (accountByUser.has(userId)) continue;
		const { data: account, error } = await getOrCreateSimAccount(srv, userId);
		if (error || !account) {
			return NextResponse.json(
				{ success: false, error: `创建模拟账户失败: ${userId}` },
				{ status: 500 },
			);
		}
		accountByUser.set(userId, account.id);
	}

	const insertRows = trades.map((row) => ({
		account_id: accountByUser.get(String(row.userId)) ?? null,
		user_id: String(row.userId),
		symbol: String(row.symbol),
		side: row.side === "sell" ? "sell" : "buy",
		price: Number(row.price ?? 0),
		quantity: Number(row.quantity ?? 0),
		commission: Number(row.commission ?? 0),
		stamp_tax: Number(row.stampTax ?? 0),
		trade_time: row.tradeTime ? new Date(row.tradeTime).toISOString() : new Date().toISOString(),
		environment: "live",
		source: row.source ?? "live_api",
		external_trade_id: row.externalTradeId ?? null,
	}));

	const invalid = insertRows.find(
		(x) => !x.account_id || !x.user_id || !x.symbol || x.price <= 0 || x.quantity <= 0,
	);
	if (invalid) {
		return NextResponse.json({ success: false, error: "存在非法成交记录" }, { status: 400 });
	}

	const { error } = await srv.from("sim_trades").upsert(insertRows, {
		onConflict: "source,external_trade_id",
		ignoreDuplicates: true,
	});
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	return NextResponse.json({ success: true, imported: insertRows.length, requestId });
}
