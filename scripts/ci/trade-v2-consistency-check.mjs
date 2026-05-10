#!/usr/bin/env node

import {
	assertCanonicalSymbol,
	isCanonicalCnSymbol,
	normalizeCnSymbol,
	SYMBOL_FORMAT_HINT,
} from "../shared/trade-symbol-utils.mjs";
import { buildExecutionLogCopy, resolveExecutionTone } from "../shared/trade-execution-copy.mjs";

const baseUrl = (process.env.BASE_URL ?? "").trim().replace(/\/+$/, "");
const userCookie = (process.env.USER_COOKIE ?? "").trim();
const rawSymbol = (process.env.TQ_SMOKE_SYMBOL ?? "600000.SH").trim().toUpperCase();
const accountType = (process.env.TQ_ACCOUNT_TYPE ?? "normal").trim() === "credit" ? "credit" : "normal";
const quantity = Number(process.env.TQ_ORDER_QTY ?? "600");
const maxAttempts = Number(process.env.TQ_MAX_ATTEMPTS ?? "5");
const checkForceClose = String(process.env.TQ_CHECK_FORCE_CLOSE ?? "") === "1";

const symbol = normalizeCnSymbol(rawSymbol);
const bareSixDigits = symbol.replace(/\.(SH|SZ)$/i, "");

if (!baseUrl) {
	console.error("Missing BASE_URL");
	process.exit(1);
}
if (!userCookie) {
	console.error("Missing USER_COOKIE");
	process.exit(1);
}
if (!Number.isInteger(quantity) || quantity <= 0 || quantity % 100 !== 0) {
	console.error("TQ_ORDER_QTY must be a positive integer multiple of 100");
	process.exit(1);
}
if (!isCanonicalCnSymbol(symbol)) {
	console.error(`TQ_SMOKE_SYMBOL must be ${SYMBOL_FORMAT_HINT}`);
	process.exit(1);
}

function headers() {
	return {
		"Content-Type": "application/json",
		Cookie: userCookie,
	};
}

async function requestJson(name, method, path, body, { allowFailure = false } = {}) {
	const res = await fetch(`${baseUrl}${path}`, {
		method,
		headers: headers(),
		body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { success: false, error: `Invalid JSON: ${text.slice(0, 160)}` };
	}
	const ok = res.ok && json?.success === true;
	const detail = ok ? "" : ` | ${String(json?.error ?? text).slice(0, 180).replace(/\s+/g, " ")}`;
	console.log(`${ok ? "PASS" : "FAIL"} ${name} -> ${res.status} ${path}${detail}`);
	if (!ok && !allowFailure) {
		throw new Error(`${name} failed`);
	}
	return { ok, status: res.status, data: json?.data, error: json?.error };
}

function longQty(positions, targetSymbol) {
	return (positions ?? [])
		.filter((p) => String(p.symbol ?? "").toUpperCase() === targetSymbol && p.position_type === "long")
		.reduce((sum, p) => sum + Number(p.quantity ?? 0), 0);
}

async function fetchSnapshot() {
	const [orders, trades, positions] = await Promise.all([
		requestJson("orders snapshot", "GET", `/api/trade-v2/orders?accountType=${accountType}`),
		requestJson("trades snapshot", "GET", `/api/trade-v2/trades?accountType=${accountType}`),
		requestJson("positions snapshot", "GET", `/api/trade-v2/positions?accountType=${accountType}`),
	]);
	return {
		orders: Array.isArray(orders.data) ? orders.data : [],
		trades: Array.isArray(trades.data) ? trades.data : [],
		positions: Array.isArray(positions.data) ? positions.data : [],
	};
}

async function main() {
	const quoteRes = await requestJson(
		"quote",
		"GET",
		`/api/market/quote?symbol=${encodeURIComponent(symbol)}`,
	);
	const quotePrice = Number(quoteRes.data?.price ?? 0);
	if (!Number.isFinite(quotePrice) || quotePrice <= 0) {
		throw new Error("quote price is invalid");
	}
	if (String(quoteRes.data?.market_mode ?? "") !== "l1") {
		throw new Error("quote market_mode mismatch");
	}
	if (!Array.isArray(quoteRes.data?.order_book?.asks) || !Array.isArray(quoteRes.data?.order_book?.bids)) {
		throw new Error("quote response missing order_book asks/bids");
	}

	// 申请资源失败不阻塞检查，某些环境可能无公共票池。
	await requestJson(
		"resource apply long",
		"POST",
		"/api/resources/apply",
		{ symbol, side: "long", quantity },
		{ allowFailure: true },
	);

	const before = await fetchSnapshot();
	const beforeLong = longQty(before.positions, symbol);

	let placedOrderId = "";
	let placedFilledQty = 0;
	let placedStatus = "";
	const orderPrice = Number((quotePrice * 1.03).toFixed(3));

	for (let i = 0; i < maxAttempts; i += 1) {
		const place = await requestJson(
			`place order attempt ${i + 1}`,
			"POST",
			"/api/trade-v2/order",
			{
				symbol: bareSixDigits,
				side: "buy",
				price: orderPrice,
				quantity,
				accountType,
				positionMode: "long",
			},
			{ allowFailure: true },
		);
		if (!place.ok) continue;
		placedOrderId = String(place.data?.id ?? "");
		placedFilledQty = Number(place.data?.filled_qty ?? 0);
		placedStatus = String(place.data?.status ?? "");
		console.log(
			`INFO execution attempt ${i + 1}: tone=${resolveExecutionTone(placedStatus)} | ${buildExecutionLogCopy({
				side: "buy",
				positionMode: "long",
				status: placedStatus,
				message: place.data?.message,
				executionTier: place.data?.execution_tier,
				liquidityScore: place.data?.liquidity_score,
			})}`,
		);
		if (place.ok) {
			if (String(place.data?.execution_model ?? "") !== "threshold-v1") {
				throw new Error("place order response execution_model mismatch");
			}
			if (typeof place.data?.execution_tier !== "string" || place.data.execution_tier.length === 0) {
				throw new Error("place order response missing execution_tier");
			}
			if (!Number.isFinite(Number(place.data?.liquidity_score))) {
				throw new Error("place order response missing liquidity_score");
			}
			if (!Number.isFinite(Number(place.data?.price_gap_bps))) {
				throw new Error("place order response missing price_gap_bps");
			}
		}
		if (placedOrderId && (placedStatus === "partial" || placedStatus === "filled")) {
			break;
		}
	}

	if (!placedOrderId || (placedStatus !== "partial" && placedStatus !== "filled")) {
		throw new Error("unable to place a matched order (partial/filled) within retry limit");
	}

	const after = await fetchSnapshot();
	const targetOrder = after.orders.find((o) => String(o.id) === placedOrderId);
	if (!targetOrder) {
		throw new Error(`cannot find placed order: ${placedOrderId}`);
	}
	const orderSymbol = assertCanonicalSymbol(targetOrder.symbol, "placed order symbol");
	if (orderSymbol !== symbol) {
		throw new Error(`placed order symbol mismatch: expected=${symbol}, actual=${orderSymbol}`);
	}

	const orderFilledQty = Number(targetOrder.filled_qty ?? 0);
	const tradeFilledQty = after.trades
		.filter((t) => String(t.order_id ?? "") === placedOrderId)
		.reduce((sum, t) => sum + Number(t.quantity ?? 0), 0);
	const afterLong = longQty(after.positions, symbol);
	const positionDelta = afterLong - beforeLong;

	if (orderFilledQty !== placedFilledQty) {
		throw new Error(`order filled_qty mismatch: place=${placedFilledQty}, order_row=${orderFilledQty}`);
	}
	if (tradeFilledQty !== orderFilledQty) {
		throw new Error(`trade sum mismatch: trades=${tradeFilledQty}, order_row=${orderFilledQty}`);
	}
	if (positionDelta !== orderFilledQty) {
		throw new Error(`position delta mismatch: delta=${positionDelta}, order_row=${orderFilledQty}`);
	}

	console.log(
		`PASS consistency verified: order=${placedOrderId}, symbol=${orderSymbol}, status=${placedStatus}, filled=${orderFilledQty}, positionDelta=${positionDelta} | ${buildExecutionLogCopy(
			{
				side: "buy",
				positionMode: "long",
				status: placedStatus,
			},
		)}`,
	);

	if (checkForceClose) {
		const closeResult = await requestJson("force close manual", "POST", "/api/trade-v2/force-close", {});
		if (typeof closeResult.data?.jobId !== "string" || closeResult.data.jobId.length === 0) {
			throw new Error("force close response missing jobId");
		}
		if (!Number.isFinite(Number(closeResult.data?.total))) {
			throw new Error("force close response missing total");
		}
		if (!Number.isFinite(Number(closeResult.data?.success))) {
			throw new Error("force close response missing success");
		}
		if (!Number.isFinite(Number(closeResult.data?.failed))) {
			throw new Error("force close response missing failed");
		}
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
