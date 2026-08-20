import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const testDir = dirname(fileURLToPath(import.meta.url));

async function loadTsModule(specifier) {
	const { register } = await import("node:module");
	register(join(testDir, "../lab/ts-loader.mjs"), pathToFileURL(testDir));
	return import(specifier);
}

test("personal quota is zero when user has no resource row", async () => {
	const { getPersonalQuotaForSymbol } = await loadTsModule("../../src/lib/trade-v2/resources.ts");
	assert.equal(getPersonalQuotaForSymbol([], "600000.SH", "short"), 0);
	assert.equal(getPersonalQuotaForSymbol([], "600000.SH", "long"), 0);
});

test("personal quota uses side base plus shared dynamic leftover", async () => {
	const { getPersonalQuotaForSymbol } = await loadTsModule("../../src/lib/trade-v2/resources.ts");
	const rows = [
		{
			symbol: "600000.SH",
			long_quota: 800,
			short_quota: 0,
			dynamic_quota: 200,
		},
	];
	assert.equal(getPersonalQuotaForSymbol(rows, "600000.SH", "long"), 1000);
	assert.equal(getPersonalQuotaForSymbol(rows, "600000.SH", "short"), 200);
	assert.equal(getPersonalQuotaForSymbol(rows, "000001.SZ", "long"), 0);
});

test("opening a long buy or short sell consumes quota; covering does not", async () => {
	const { getOpeningQuotaSide } = await loadTsModule("../../src/lib/trade-v2/resources.ts");
	assert.equal(getOpeningQuotaSide("long", "buy"), "long");
	assert.equal(getOpeningQuotaSide("short", "sell"), "short");
	assert.equal(getOpeningQuotaSide("long", "sell"), null);
	assert.equal(getOpeningQuotaSide("short", "buy"), null);
});

test("quota reject copy tells user to apply personal quota first", async () => {
	const { quotaInsufficientMessage, isQuotaInsufficientReason } = await loadTsModule(
		"../../src/lib/trade-v2/resources.ts",
	);
	assert.equal(quotaInsufficientMessage("short"), "空头额度不足，请先在「资源」申请空头额度");
	assert.equal(quotaInsufficientMessage("long"), "多头额度不足，请先在「资源」申请多头额度");
	assert.equal(isQuotaInsufficientReason("空头额度不足"), true);
	assert.equal(isQuotaInsufficientReason("资金不足"), false);
});

test("operation failures always include why and the next successful step", async () => {
	const { explainOperationFailure, splitOperationGuidance, hasOperationGuidance } = await loadTsModule(
		"../../src/lib/trade-v2/operation-guidance.ts",
	);
	const shortQuota = explainOperationFailure("空头额度不足");
	assert.equal(hasOperationGuidance(shortQuota), true);
	assert.match(shortQuota, /空头额度不足/);
	assert.match(shortQuota, /申请/);
	const congested = explainOperationFailure("撮合通道拥堵，委托被风控拦截（模拟）");
	assert.match(congested, /下一步：/);
	assert.match(congested, /重试/);
	const returnShort = explainOperationFailure("可退回空头额度不足");
	assert.match(returnShort, /个人已有空头额度/);
	assert.doesNotMatch(returnShort, /申请空头额度/);
	const already = "价格必须大于 0。下一步：先填价格。";
	assert.equal(explainOperationFailure(already), already);
	const split = splitOperationGuidance("当前无可平仓持仓");
	assert.equal(split.reason, "当前无可平仓持仓");
	assert.match(split.next, /仓位/);
});

test("normalizeTradeApiError keeps string order errors and appends next step", async () => {
	const { normalizeTradeApiError } = await loadTsModule("../../src/lib/trade-v2/api-error.ts");
	const shortMsg = normalizeTradeApiError("空头额度不足，请先在「资源」申请空头额度", "下单失败");
	assert.match(shortMsg, /空头额度不足/);
	assert.match(shortMsg, /下一步：/);
	const longMsg = normalizeTradeApiError(
		new Error("多头额度不足，请先在「资源」申请多头额度"),
		"下单失败",
	);
	assert.match(longMsg, /多头额度不足/);
	assert.match(longMsg, /下一步：/);
});

test("trade workbench labels exam desk, prechecks quota, and closes with position side", () => {
	const src = readFileSync(join(root, "src/components/trade/TradeV2PageClient.tsx"), "utf8");
	assert.match(src, /考核盘（模拟）/);
	assert.match(src, /getOpeningQuotaSide/);
	assert.match(src, /positionMode: selectedPosition\.position_type/);
	assert.match(src, /positionMode: position\.position_type/);
	assert.match(src, /去申请额度/);
	assert.match(src, /toastFail/);
	assert.match(src, /explainOperationFailure/);
	assert.match(src, /collectTradeDiagnostics/);
	assert.match(src, /测试反馈|FeedbackButton/);
});

test("order API normalizes string errors from placeV2Order", () => {
	const src = readFileSync(join(root, "src/app/api/trade-v2/order/route.ts"), "utf8");
	assert.match(src, /normalizeTradeApiError/);
	assert.match(src, /result\.body\.error/);
});

test("feedback diagnostics include last failure, symbol and recent reject", async () => {
	const {
		recordTradeFailure,
		buildTradeFeedbackDiagnostics,
	} = await loadTsModule("../../src/lib/trade-v2/feedback-diagnostics.ts");
	recordTradeFailure("空头额度不足。下一步：先申请额度。");
	const text = buildTradeFeedbackDiagnostics({
		pathname: "/trade",
		symbol: "600000.SH",
		positionMode: "short",
		accountType: "normal",
		qty: "1000",
		price: "9.00",
		fetchError: "",
		plan: "T0_trial",
		membershipStatus: "trialing",
		longQuota: 0,
		shortQuota: 0,
		recentOrders: [
			{
				symbol: "600000.SH",
				side: "sell",
				status: "rejected",
				reject_reason: "空头额度不足",
			},
		],
	});
	assert.match(text, /自动诊断/);
	assert.match(text, /600000\.SH/);
	assert.match(text, /positionMode: short/);
	assert.match(text, /空头额度不足/);
	assert.match(text, /personalShortQuota: 0/);
});

test("feedback API and button collect tester diagnostics", () => {
	const api = readFileSync(join(root, "src/app/api/feedback/route.ts"), "utf8");
	const button = readFileSync(join(root, "src/components/common/FeedbackButton.tsx"), "utf8");
	assert.match(api, /diagnostics/);
	assert.match(button, /测试反馈/);
	assert.match(button, /collectDiagnostics/);
	assert.match(button, /你遇到的问题/);
});
