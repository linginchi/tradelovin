import assert from "node:assert/strict";
import test from "node:test";

import {
	buildStaffCheckoutForm,
	buildStaffCheckoutSessionParams,
	isStaffTuitionSession,
	parseTuitionAmountHkd,
	publicPayUrl,
	resolveAdminLoginNextPath,
	resolveStaffPayOrigin,
	STAFF_PAY_KIND,
	STAFF_PAY_MAX_HKD,
	STAFF_PAY_MIN_HKD,
	isAllowedStaffPayBrowserOrigin,
} from "@/lib/staff-pay/staff-pay";
import {
	isStaffPayPassword,
	resolveStaffPayPassword,
	signStaffPayCookie,
	verifyStaffPayCookie,
} from "@/lib/staff-pay/gate";
import { isWeChatUserAgent } from "@/lib/staff-pay/wechat";
import { generateStaffPayToken } from "@/lib/staff-pay/token";

test("parseTuitionAmountHkd accepts 4 to 200000 with two decimals", () => {
	assert.deepEqual(parseTuitionAmountHkd("4"), { ok: true, amountCents: 400 });
	assert.deepEqual(parseTuitionAmountHkd("4.5"), { ok: true, amountCents: 450 });
	assert.deepEqual(parseTuitionAmountHkd(" 200000.00 "), { ok: true, amountCents: 20_000_000 });
	assert.equal(STAFF_PAY_MIN_HKD, 4);
	assert.equal(STAFF_PAY_MAX_HKD, 200_000);
});

test("parseTuitionAmountHkd rejects invalid amounts", () => {
	assert.equal(parseTuitionAmountHkd("1").ok, false);
	assert.equal(parseTuitionAmountHkd("3.99").ok, false);
	assert.equal(parseTuitionAmountHkd("0.99").ok, false);
	assert.equal(parseTuitionAmountHkd("200000.01").ok, false);
	assert.equal(parseTuitionAmountHkd("1.234").ok, false);
	assert.equal(parseTuitionAmountHkd("").ok, false);
	assert.equal(parseTuitionAmountHkd("abc").ok, false);
	assert.equal(parseTuitionAmountHkd("-10").ok, false);
});

test("publicPayUrl defaults to xeoaxis.com and accepts a local origin", () => {
	assert.equal(publicPayUrl("abc123"), "https://xeoaxis.com/p/abc123");
	assert.equal(publicPayUrl("abc123", "http://192.168.31.183:3001"), "http://192.168.31.183:3001/p/abc123");
	const params = buildStaffCheckoutSessionParams({
		token: "abc123",
		amountCents: 10_000,
		payerName: "张三",
		note: "一期",
		createdBy: "staff@example.com",
		expiresAtUnix: 1_800_000_000,
	});
	assert.equal(params.success_url?.startsWith("https://xeoaxis.com/p/abc123"), true);
	assert.equal(params.cancel_url, "https://xeoaxis.com/p/abc123?canceled=1");
	assert.equal("payment_method_types" in params, false);
	assert.equal(params.mode, "payment");
	assert.equal(params.metadata?.kind, STAFF_PAY_KIND);
	assert.equal(params.metadata?.token, "abc123");
	assert.equal(params.line_items?.[0] && "price_data" in params.line_items[0], true);
	const localParams = buildStaffCheckoutSessionParams({
		token: "abc123",
		amountCents: 10_000,
		payerName: "张三",
		note: "一期",
		createdBy: "staff@example.com",
		expiresAtUnix: 1_800_000_000,
		origin: "http://192.168.31.183:3001",
	});
	assert.equal(localParams.success_url?.startsWith("http://192.168.31.183:3001/p/abc123"), true);
	assert.equal(localParams.cancel_url, "http://192.168.31.183:3001/p/abc123?canceled=1");
});

test("staff checkout form uses Stripe fetch fields without payment_method_types", () => {
	const form = buildStaffCheckoutForm({
		token: "abc123",
		amountCents: 10_000,
		payerName: "张三",
		note: "一期",
		createdBy: "staff",
		expiresAtUnix: 1_800_000_000,
	});
	assert.equal(form.get("mode"), "payment");
	assert.equal(form.get("line_items[0][price_data][currency]"), "hkd");
	assert.equal(form.get("line_items[0][price_data][unit_amount]"), "10000");
	assert.equal(form.get("metadata[kind]"), STAFF_PAY_KIND);
	assert.equal(form.has("payment_method_types[0]"), false);
});

test("isStaffTuitionSession does not activate membership", () => {
	assert.equal(isStaffTuitionSession({ metadata: { kind: STAFF_PAY_KIND, token: "t" } }), true);
	assert.equal(isStaffTuitionSession({ metadata: { userId: "u1" } }), false);
	assert.equal(isStaffTuitionSession({ metadata: null }), false);
});

test("generateStaffPayToken is unguessable", () => {
	const a = generateStaffPayToken();
	const b = generateStaffPayToken();
	assert.notEqual(a, b);
	assert.ok(a.length >= 16);
	assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("resolveAdminLoginNextPath allows staff pay and cjkzt only", () => {
	assert.equal(resolveAdminLoginNextPath("/staff/pay"), "/staff/pay");
	assert.equal(resolveAdminLoginNextPath("/cjkzt/fees"), "/cjkzt/fees");
	assert.equal(resolveAdminLoginNextPath("//evil.com"), "/cjkzt");
	assert.equal(resolveAdminLoginNextPath("https://evil.com"), "/cjkzt");
	assert.equal(resolveAdminLoginNextPath("/staff/pay/../cjkzt"), "/cjkzt");
	assert.equal(resolveAdminLoginNextPath(null), "/cjkzt");
});

test("resolveStaffPayOrigin uses request origin in development for local and LAN tests", () => {
	assert.equal(
		resolveStaffPayOrigin("http://localhost:3001/api/staff/pay", "development"),
		"http://localhost:3001",
	);
	assert.equal(
		resolveStaffPayOrigin("http://127.0.0.1:3001/api/staff/pay", "development"),
		"http://127.0.0.1:3001",
	);
	assert.equal(
		resolveStaffPayOrigin("http://192.168.31.183:3001/api/staff/pay", "development"),
		"http://192.168.31.183:3001",
	);
	assert.equal(
		resolveStaffPayOrigin("https://evil.example/api/staff/pay", "development"),
		"https://xeoaxis.com",
	);
	assert.equal(
		resolveStaffPayOrigin("https://leolearnstotrade.com/api/staff/pay", "production"),
		"https://xeoaxis.com",
	);
});

test("staff password gate accepts the configured password only", () => {
	assert.equal(isStaffPayPassword("staffpay", "staffpay"), true);
	assert.equal(isStaffPayPassword("wrong", "staffpay"), false);
	assert.equal(isStaffPayPassword("", "staffpay"), false);
	assert.equal(isStaffPayPassword("staffpay", null), false);
	assert.equal(resolveStaffPayPassword({ STAFF_PAY_PASSWORD: "secret" }, "production"), "secret");
	assert.equal(resolveStaffPayPassword({}, "development"), "staffpay");
	assert.equal(resolveStaffPayPassword({}, "production"), null);
	const token = signStaffPayCookie("staffpay");
	assert.equal(verifyStaffPayCookie(token, "staffpay"), true);
	assert.equal(verifyStaffPayCookie(token, "other"), false);
});

test("staff pay mutations allow xeoaxis origin behind mainland nginx", () => {
	const proxied = new Request("https://tradelovin.mark-377.workers.dev/api/staff/pay/login", {
		method: "POST",
		headers: { origin: "https://xeoaxis.com" },
	});
	assert.equal(isAllowedStaffPayBrowserOrigin(proxied), true);
	const www = new Request("https://tradelovin.mark-377.workers.dev/api/staff/pay", {
		method: "POST",
		headers: { origin: "https://www.xeoaxis.com", referer: "https://www.xeoaxis.com/staff/pay" },
	});
	assert.equal(isAllowedStaffPayBrowserOrigin(www), true);
	const evil = new Request("https://tradelovin.mark-377.workers.dev/api/staff/pay/login", {
		method: "POST",
		headers: { origin: "https://evil.example" },
	});
	assert.equal(isAllowedStaffPayBrowserOrigin(evil), false);
});

test("isWeChatUserAgent detects MicroMessenger", () => {
	assert.equal(
		isWeChatUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.0",
		),
		true,
	);
	assert.equal(isWeChatUserAgent("Mozilla/5.0 (Macintosh) Chrome/120"), false);
});
