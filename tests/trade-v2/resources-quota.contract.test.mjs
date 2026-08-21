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
	assert.match(src, /id="applyQty"/);
	assert.match(src, /id="applySymbol"/);
	assert.match(src, /selectPublicPoolSymbol/);
	assert.match(src, /hasSymbolInPublicPool/);
	assert.match(src, /Number\(applyQty\)/);
	assert.match(src, /\/api\/resources\/coach/);
	assert.match(src, /bindCoach/);
	assert.match(src, /CoachBadge/);
	assert.match(src, /CoachExamResourcePanel/);
	assert.match(src, /审核中/);
	assert.match(src, /canOpenDesk/);
	assert.doesNotMatch(src, /再用下单区数量申请/);
	assert.doesNotMatch(src, /请教练到「教练工作台」加入标的/);
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
	assert.match(api, /attachments/);
	assert.match(api, /parseScreenshotDataUrl/);
	assert.doesNotMatch(api, /截图数据\(前200字符\)/);
	assert.match(button, /测试反馈/);
	assert.match(button, /collectDiagnostics/);
	assert.match(button, /你遇到的问题/);
	assert.match(button, /screenshotReading/);
	assert.match(button, /MAX_SCREENSHOT_BYTES/);
});

test("missing coach inventory symbol tells tester to apply from the exam resource panel", async () => {
	const { explainOperationFailure } = await loadTsModule("../../src/lib/trade-v2/operation-guidance.ts");
	const text = explainOperationFailure("教练库存中不存在该标的");
	assert.match(text, /资源/);
	assert.match(text, /审核中/);
	const unbound = explainOperationFailure("请先选择金钱豹教练并等待对方接受");
	assert.match(unbound, /绑定/);
	const pending = explainOperationFailure("该标的已有审核中的申请");
	assert.match(pending, /审核中/);
});

test("admin public resource upsert rejects illegal symbol and negative limits", async () => {
	const { parsePublicResourceUpsert, personalQuotaBlocksDelete } = await loadTsModule(
		"../../src/lib/trade-v2/admin-public-resources.ts",
	);
	assert.equal(parsePublicResourceUpsert({ symbol: "not-a-stock", long_limit: 1, short_limit: 1 }).ok, false);
	assert.equal(parsePublicResourceUpsert({ symbol: "600519", long_limit: -1, short_limit: 0 }).ok, false);
	const ok = parsePublicResourceUpsert({
		symbol: "600519",
		name: "茅台",
		long_limit: 100000,
		short_limit: "200000",
	});
	assert.equal(ok.ok, true);
	if (ok.ok) {
		assert.equal(ok.data.symbol, "600519.SH");
		assert.equal(ok.data.short_limit, 200000);
	}
	assert.equal(personalQuotaBlocksDelete([{ long_quota: 0, short_quota: 0 }], 0), false);
	assert.equal(personalQuotaBlocksDelete([{ long_quota: 0, short_quota: 100 }], 0), true);
	assert.equal(personalQuotaBlocksDelete([], 50), true);
});

test("admin public resources API guards writes and blocks occupied deletes", () => {
	const api = readFileSync(join(root, "src/app/api/admin/resources/public/route.ts"), "utf8");
	const nav = readFileSync(join(root, "src/components/admin/AdminShell.tsx"), "utf8");
	assert.match(api, /requireAdminSession\(\)/);
	assert.match(api, /export async function GET/);
	assert.match(api, /export async function PUT/);
	assert.match(api, /export async function DELETE/);
	assert.match(api, /personalQuotaBlocksDelete/);
	assert.match(nav, /模拟盘资源/);
	assert.match(nav, /\/resources/);
});

test("screenshot data URL is parsed into a real email attachment payload", async () => {
	const { parseScreenshotDataUrl, MAX_SCREENSHOT_BYTES } = await loadTsModule(
		"../../src/lib/email/screenshot-attachment.ts",
	);
	const empty = parseScreenshotDataUrl(undefined);
	assert.equal(empty.ok, true);
	if (empty.ok) assert.equal(empty.attachment, null);
	const png = parseScreenshotDataUrl("data:image/png;base64,iVBORw0KGgo=", "shot.png");
	assert.equal(png.ok, true);
	if (png.ok && png.attachment) {
		assert.equal(png.attachment.filename, "shot.png");
		assert.equal(png.attachment.contentType, "image/png");
		assert.ok(png.attachment.content.length > 0);
	}
	assert.equal(parseScreenshotDataUrl("not-a-data-url").ok, false);
	assert.ok(MAX_SCREENSHOT_BYTES >= 3 * 1024 * 1024);
});

test("student apply creates a pending request instead of granting from the public pool", () => {
	const apply = readFileSync(join(root, "src/app/api/resources/apply/route.ts"), "utf8");
	assert.match(apply, /createResourceRequest/);
	assert.match(apply, /pending/);
	assert.match(apply, /grantCoachQuotaWithRecord/);
	assert.match(apply, /selfGranted/);
	assert.doesNotMatch(apply, /applyResource\(/);
	assert.doesNotMatch(apply, /tq_apply_resource/);
	const service = readFileSync(join(root, "src/lib/coach/service.ts"), "utf8");
	assert.match(service, /status: "pending"/);
	assert.match(service, /审核中/);
	assert.doesNotMatch(service, /教练库存中不存在该标的/);
	assert.doesNotMatch(service, /remaining < input.quantity/);
});

test("coach grant RPC deducts coach inventory not the public pool", () => {
	const sql = readFileSync(join(root, "supabase/migrations/20260820120000_golden_leopard_coach_quota.sql"), "utf8");
	assert.match(sql, /CREATE TABLE IF NOT EXISTS public.coach_students/);
	assert.match(sql, /CREATE TABLE IF NOT EXISTS public.tq_coach_resources/);
	assert.match(sql, /CREATE TABLE IF NOT EXISTS public.tq_resource_requests/);
	assert.match(sql, /is_coach BOOLEAN/);
	assert.match(sql, /tq_coach_grant_resource/);
	assert.match(sql, /tq_coach_return_resource/);
	assert.match(sql, /FROM public.tq_coach_resources/);
	assert.doesNotMatch(sql, /UPDATE public.tq_public_resources/);
	assert.doesNotMatch(sql, /INSERT INTO public.tq_public_resources/);
	const selfGrant = readFileSync(join(root, "supabase/migrations/20260820190000_coach_self_grant.sql"), "utf8");
	assert.match(selfGrant, /v_self_grant/);
	assert.doesNotMatch(selfGrant, /不能给自己发放额度/);
});

test("coach desk requires is_coach and active T3", async () => {
	const { isActiveT3Plan } = await loadTsModule("../../src/lib/coach/types.ts");
	assert.equal(isActiveT3Plan("T3", "active", new Date(Date.now() + 86400000).toISOString()), true);
	assert.equal(isActiveT3Plan("T2", "active", new Date(Date.now() + 86400000).toISOString()), false);
	assert.equal(isActiveT3Plan("T3", "expired", new Date(Date.now() + 86400000).toISOString()), false);
	const guard = readFileSync(join(root, "src/lib/coach/guard.ts"), "utf8");
	assert.match(guard, /requireCoachDesk/);
	assert.match(guard, /canOpenCoachDesk/);
	const desk = readFileSync(join(root, "src/app/[locale]/coach/page.tsx"), "utf8");
	assert.match(desk, /CoachDeskClient/);
	const nav = readFileSync(join(root, "src/components/shared/SiteTopBar.tsx"), "utf8");
	assert.match(nav, /CoachDeskNavLink/);
});

test("admin can appoint golden leopard coaches without approving each quota", () => {
	const coaches = readFileSync(join(root, "src/app/api/admin/coaches/route.ts"), "utf8");
	assert.match(coaches, /is_coach/);
	assert.match(coaches, /requireAdminSession/);
	const panel = readFileSync(join(root, "src/components/admin/AdminInstructorsPanel.tsx"), "utf8");
	assert.match(panel, /金钱豹教练/);
	assert.match(panel, /\/api\/admin\/coaches/);
	const badges = readFileSync(join(root, "src/app/api/public/badges/route.ts"), "utf8");
	assert.match(badges, /GOLDEN_LEOPARD_COACH_BADGE/);
	const guide = readFileSync(join(root, "docs/trade/t0-sim-exam-guide.zh.md"), "utf8");
	assert.match(guide, /金钱豹教练/);
	assert.match(guide, /审核中/);
	assert.match(guide, /考核盘「资源」栏/);
	assert.match(guide, /后台「讲师」页/);
	assert.doesNotMatch(guide, /cjkzt/i);
	assert.doesNotMatch(guide, /教练打开 `\/coach`：加入标的/);
	assert.doesNotMatch(guide, /配置公共资源池。学员只能申请这里已有的标的/);
	const guideHtml = readFileSync(join(root, "docs/trade/t0-sim-exam-guide.zh.html"), "utf8");
	assert.doesNotMatch(guideHtml, /cjkzt/i);
	const tradeUi = [
		readFileSync(join(root, "src/components/trade/TradeV2PageClient.tsx"), "utf8"),
		readFileSync(join(root, "src/components/trade/TradeGuideModal.tsx"), "utf8"),
		readFileSync(join(root, "src/components/coach/CoachExamResourcePanel.tsx"), "utf8"),
		readFileSync(join(root, "src/lib/trade-v2/operation-guidance.ts"), "utf8"),
	].join("\n");
	assert.doesNotMatch(tradeUi, /cjkzt/i);
	assert.match(tradeUi, /不必绑定另一位教练|不必绑定其他教练/);
	const requests = readFileSync(join(root, "src/app/api/coach/requests/route.ts"), "utf8");
	assert.match(requests, /rejectReason/);
	assert.match(requests, /tq_coach_grant_resource|grantCoachResource/);
	assert.match(requests, /reviewedBy|reviewed_by|markResourceRequestReviewed/);
	assert.match(requests, /ensureCoachInventoryForGrant/);
	const migration = readFileSync(join(root, "supabase/migrations/20260820183000_resource_request_reviewed_by.sql"), "utf8");
	assert.match(migration, /reviewed_by/);
	const examPanel = readFileSync(join(root, "src/components/coach/CoachExamResourcePanel.tsx"), "utf8");
	assert.match(examPanel, /可发放库存/);
	assert.match(examPanel, /待我审批/);
	assert.match(examPanel, /直接发放/);
	assert.match(examPanel, /自己（本账号）/);
	assert.match(examPanel, /\/api\/coach\/resources/);
	assert.match(examPanel, /\/api\/coach\/requests/);
	const adminResources = readFileSync(join(root, "src/app/cjkzt/(protected)/resources/page.tsx"), "utf8");
	assert.match(adminResources, /日常不要在这里加/);
	const guideModal = readFileSync(join(root, "src/components/trade/TradeGuideModal.tsx"), "utf8");
	assert.match(guideModal, /审核中/);
});
