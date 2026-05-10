#!/usr/bin/env node

import {
	assertCanonicalSymbol,
	isCanonicalCnSymbol,
	normalizeCnSymbol,
	SYMBOL_FORMAT_HINT,
} from "../shared/trade-symbol-utils.mjs";
import { buildExecutionLogCopy } from "../shared/trade-execution-copy.mjs";

const baseUrl = (process.env.BASE_URL ?? "").trim().replace(/\/+$/, "");
const userCookie = (process.env.USER_COOKIE ?? "").trim();
const rawSymbol = (process.env.TQ_SMOKE_SYMBOL ?? "600000.SH").trim().toUpperCase();
const SYMBOL_ERROR_KEYWORD = "symbol 格式不合法";
const checkForceClose = String(process.env.TQ_CHECK_FORCE_CLOSE ?? "") === "1";

const symbol = normalizeCnSymbol(rawSymbol);

if (!baseUrl) {
	console.error(
		"Missing BASE_URL. Example: BASE_URL=https://tradelovin.com USER_COOKIE='sb-access-token=...' npm run smoke:trade-v2",
	);
	process.exit(1);
}
if (!userCookie) {
	console.error("Missing USER_COOKIE.");
	process.exit(1);
}
if (!isCanonicalCnSymbol(symbol)) {
	console.error(`TQ_SMOKE_SYMBOL must be ${SYMBOL_FORMAT_HINT}`);
	process.exit(1);
}

function makeHeaders(extra = {}) {
	return {
		"Content-Type": "application/json",
		Cookie: userCookie,
		...extra,
	};
}

async function requestJson(name, method, path, body) {
	const res = await fetch(`${baseUrl}${path}`, {
		method,
		headers: makeHeaders(),
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
	if (!ok) {
		throw new Error(`${name} failed`);
	}
	return json?.data;
}

async function requestJsonExpectFailure(name, method, path, body) {
	const res = await fetch(`${baseUrl}${path}`, {
		method,
		headers: makeHeaders(),
		body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { success: false, error: `Invalid JSON: ${text.slice(0, 160)}` };
	}
	const failedAsExpected = !res.ok && json?.success === false;
	const detail = ` | ${String(json?.error ?? text).slice(0, 180).replace(/\s+/g, " ")}`;
	console.log(`${failedAsExpected ? "PASS" : "FAIL"} ${name} -> ${res.status} ${path}${detail}`);
	if (!failedAsExpected) {
		throw new Error(`${name} expected failure but succeeded`);
	}
	return { status: res.status, error: String(json?.error ?? "") };
}

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(`ASSERT_FAIL: ${message}`);
	}
	console.log(`ASSERT PASS ${message}`);
}

function assertSymbolFormatError(result, context) {
	assertTrue(result.status === 400, `${context} returns 400`);
	assertTrue(
		String(result.error ?? "").includes(SYMBOL_ERROR_KEYWORD),
		`${context} error includes unified symbol message`,
	);
}

function extractSymbol(input) {
	return String(input?.match?.(/\b\d{6}\.(?:SH|SZ)\b/i)?.[0] ?? "").toUpperCase();
}

function formatDiagnostic(riskItem) {
	const code = String(riskItem?.code ?? "RISK");
	const symbol = extractSymbol(String(riskItem?.content ?? "")) || "UNKNOWN";
	const time = String(riskItem?.created_at ?? "UNKNOWN_TIME");
	const detail = String(riskItem?.content ?? "");
	return `code=${code} | symbol=${symbol} | time=${time} | detail=${detail}`;
}

async function main() {
	const quote = await requestJson("trade-v2 quote", "GET", `/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
	assertTrue(Number.isFinite(Number(quote?.price)) && Number(quote.price) > 0, "quote response has positive price");
	assertTrue(String(quote?.market_mode ?? "") === "l1", "quote response market_mode is l1");
	assertTrue(
		Array.isArray(quote?.order_book?.asks) && Array.isArray(quote?.order_book?.bids),
		"quote response includes order_book asks/bids",
	);
	await requestJson("trade-v2 account", "GET", "/api/trade-v2/account?accountType=normal");
	await requestJson("trade-v2 orders list", "GET", "/api/trade-v2/orders?accountType=normal");
	await requestJson("trade-v2 positions list", "GET", "/api/trade-v2/positions?accountType=normal");
	await requestJson("trade-v2 trades list", "GET", "/api/trade-v2/trades?accountType=normal");
	const invalidOrder = await requestJsonExpectFailure("trade-v2 order invalid symbol", "POST", "/api/trade-v2/order", {
		symbol: "BAD",
		side: "buy",
		price: 10,
		quantity: 100,
		accountType: "normal",
		positionMode: "long",
	});
	assertSymbolFormatError(invalidOrder, "trade-v2 invalid symbol");
	const invalidWatchlist = await requestJsonExpectFailure("watchlist invalid symbol", "POST", "/api/watchlist", {
		symbol: "BAD",
		alertType: "price_above",
		alertPrice: 0.01,
	});
	assertSymbolFormatError(invalidWatchlist, "watchlist invalid symbol");
	const invalidCondition = await requestJsonExpectFailure("conditions invalid symbol", "POST", "/api/conditions", {
		symbol: "BAD",
		conditionType: "price_>=",
		conditionPrice: 0.01,
		orderSide: "buy",
		orderPrice: 0.01,
		orderQuantity: 100,
	});
	assertSymbolFormatError(invalidCondition, "conditions invalid symbol");
	const invalidApply = await requestJsonExpectFailure("resources apply invalid symbol", "POST", "/api/resources/apply", {
		symbol: "BAD",
		side: "long",
		quantity: 100,
	});
	assertSymbolFormatError(invalidApply, "resources apply invalid symbol");
	const invalidReturn = await requestJsonExpectFailure(
		"resources return invalid symbol",
		"POST",
		"/api/resources/return",
		{
			symbol: "BAD",
			side: "long",
			quantity: 100,
		},
	);
	assertSymbolFormatError(invalidReturn, "resources return invalid symbol");
	await requestJson("resources public", "GET", "/api/resources/public");
	await requestJson("resources personal", "GET", `/api/resources/personal?symbol=${encodeURIComponent(symbol)}`);

	const watch = await requestJson("watchlist create", "POST", "/api/watchlist", {
		symbol,
		alertType: "price_above",
		alertPrice: 0.01,
	});
	const bareSixDigits = symbol.replace(/\.(SH|SZ)$/i, "");
	const watchBare = await requestJson("watchlist create with 6-digit symbol", "POST", "/api/watchlist", {
		symbol: bareSixDigits,
		alertType: "price_above",
		alertPrice: 0.01,
	});
	assertCanonicalSymbol(
		watchBare?.symbol,
		"watchlist create with 6-digit symbol returns canonical suffix",
		assertTrue,
	);
	const watchCheck = await requestJson("watchlist check", "POST", "/api/watchlist/check", {});
	assertTrue(Number(watchCheck?.triggered ?? 0) >= 1, "watchlist trigger count >= 1");
	const watchList = await requestJson("watchlist list", "GET", "/api/watchlist");
	const watchRow = Array.isArray(watchList) ? watchList.find((x) => String(x.id) === String(watch?.id)) : null;
	assertTrue(Boolean(watchRow), "created watchlist row exists");
	assertTrue(Boolean(watchRow?.triggered), "created watchlist row is triggered");
	const watchBareRow = Array.isArray(watchList) ? watchList.find((x) => String(x.id) === String(watchBare?.id)) : null;
	assertTrue(Boolean(watchBareRow), "6-digit watchlist row exists");
	assertCanonicalSymbol(
		watchBareRow?.symbol,
		"6-digit watchlist row symbol normalized to canonical",
		assertTrue,
	);
	if (watch?.id) {
		await requestJson("watchlist delete", "DELETE", `/api/watchlist/${watch.id}`, {});
	}
	if (watchBare?.id) {
		await requestJson("watchlist delete 6-digit", "DELETE", `/api/watchlist/${watchBare.id}`, {});
	}

	const condition = await requestJson("condition create", "POST", "/api/conditions", {
		symbol,
		conditionType: "price_>=",
		conditionPrice: 0.01,
		orderSide: "buy",
		orderPrice: 0.01,
		orderQuantity: 100,
	});
	const conditionBare = await requestJson("condition create with 6-digit symbol", "POST", "/api/conditions", {
		symbol: bareSixDigits,
		conditionType: "price_>=",
		conditionPrice: 0.01,
		orderSide: "buy",
		orderPrice: 0.01,
		orderQuantity: 100,
	});
	assertCanonicalSymbol(
		conditionBare?.symbol,
		"condition create with 6-digit symbol returns canonical suffix",
		assertTrue,
	);
	const failingCondition = await requestJson("condition create (expected fail on trigger)", "POST", "/api/conditions", {
		symbol,
		conditionType: "price_>=",
		conditionPrice: 0.01,
		orderSide: "sell",
		orderPrice: 0.01,
		orderQuantity: 99999900,
	});
	const triggerResult = await requestJson("condition trigger", "POST", "/api/conditions/trigger", {});
	assertTrue(Number(triggerResult?.triggered ?? 0) >= 1, "condition trigger count >= 1");
	assertTrue(Number(triggerResult?.failed ?? 0) >= 1, "condition trigger failed count >= 1");
	const conditionList = await requestJson("condition list", "GET", "/api/conditions");
	const conditionRow = Array.isArray(conditionList)
		? conditionList.find((x) => String(x.id) === String(condition?.id))
		: null;
	assertTrue(Boolean(conditionRow), "created condition row exists");
	assertTrue(String(conditionRow?.status) === "triggered", "created condition row status is triggered");
	const conditionBareRow = Array.isArray(conditionList)
		? conditionList.find((x) => String(x.id) === String(conditionBare?.id))
		: null;
	assertTrue(Boolean(conditionBareRow), "6-digit condition row exists");
	assertCanonicalSymbol(
		conditionBareRow?.symbol,
		"6-digit condition row symbol normalized to canonical",
		assertTrue,
	);
	const failingConditionRow = Array.isArray(conditionList)
		? conditionList.find((x) => String(x.id) === String(failingCondition?.id))
		: null;
	assertTrue(Boolean(failingConditionRow), "failing condition row exists");
	assertTrue(
		String(failingConditionRow?.status) === "active",
		"failing condition remains active after failed trigger",
	);
	if (condition?.id) {
		await requestJson("condition delete", "DELETE", `/api/conditions/${condition.id}`, {});
	}
	if (conditionBare?.id) {
		await requestJson("condition delete 6-digit", "DELETE", `/api/conditions/${conditionBare.id}`, {});
	}
	if (failingCondition?.id) {
		await requestJson("condition delete failing", "DELETE", `/api/conditions/${failingCondition.id}`, {});
	}

	const riskMessages = await requestJson("risk messages", "GET", "/api/risk/messages");
	const failureRisk = Array.isArray(riskMessages)
		? riskMessages.find((x) => x?.code === "ORDER_REJECTED" || x?.code === "BROKER_SIM_DROP")
		: null;
	const hasFailureRisk = Boolean(failureRisk);
	assertTrue(hasFailureRisk, "risk messages include failure-related entry");
	assertTrue(typeof failureRisk?.code === "string" && failureRisk.code.length > 0, "failure risk has non-empty code");
	assertTrue(
		typeof failureRisk?.content === "string" && failureRisk.content.length > 0,
		"failure risk has non-empty content",
	);
	assertTrue(
		typeof failureRisk?.created_at === "string" && failureRisk.created_at.length > 0,
		"failure risk has created_at timestamp",
	);
	const diagnostic = formatDiagnostic(failureRisk);
	assertTrue(diagnostic.includes("code="), "diagnostic contains code field");
	assertTrue(diagnostic.includes("symbol="), "diagnostic contains symbol field");
	assertTrue(diagnostic.includes("time="), "diagnostic contains time field");
	assertTrue(diagnostic.includes("detail="), "diagnostic contains detail field");
	assertTrue(
		/^code=.* \| symbol=.* \| time=.* \| detail=.*$/.test(diagnostic),
		"diagnostic matches structured format",
	);
	const brokerDropRisk = Array.isArray(riskMessages) ? riskMessages.find((x) => x?.code === "BROKER_SIM_DROP") : null;
	if (brokerDropRisk) {
		assertTrue(
			typeof brokerDropRisk?.meta?.executionTier === "string" && brokerDropRisk.meta.executionTier.length > 0,
			"broker drop risk includes executionTier meta",
		);
		assertTrue(
			Number.isFinite(Number(brokerDropRisk?.meta?.liquidityScore)),
			"broker drop risk includes liquidityScore meta",
		);
		assertTrue(
			Number.isFinite(Number(brokerDropRisk?.meta?.priceGapBps)),
			"broker drop risk includes priceGapBps meta",
		);
		console.log(
			`INFO broker drop normalized: ${buildExecutionLogCopy({
				status: "rejected",
				message: brokerDropRisk?.content,
				executionTier: brokerDropRisk?.meta?.executionTier,
				liquidityScore: brokerDropRisk?.meta?.liquidityScore,
			})}`,
		);
	}
	if (checkForceClose) {
		const closeResult = await requestJson("force close manual", "POST", "/api/trade-v2/force-close", {});
		assertTrue(typeof closeResult?.jobId === "string" && closeResult.jobId.length > 0, "force close includes jobId");
		assertTrue(Number.isFinite(Number(closeResult?.total)), "force close includes total");
		assertTrue(Number.isFinite(Number(closeResult?.success)), "force close includes success");
		assertTrue(Number.isFinite(Number(closeResult?.failed)), "force close includes failed");
	}
	console.log("trade-v2 e2e smoke completed.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
