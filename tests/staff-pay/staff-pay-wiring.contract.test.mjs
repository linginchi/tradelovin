import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("middleware skips intl for /staff and /p like /cjkzt", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /pathname === "\/staff"/);
	assert.match(source, /pathname\.startsWith\("\/staff\/"\)/);
	assert.match(
		source,
		/pathname === "\/p" \|\| pathname\.startsWith\("\/p\/"\)/,
	);
	assert.match(source, /pathname === "\/cjkzt"/);
});

test("stripe webhook branches staff_tuition before membership activate", async () => {
	const source = await readFile(
		new URL("../../src/app/api/membership/webhook/stripe/route.ts", import.meta.url),
		"utf8",
	);
	assert.match(source, /isStaffTuitionSession/);
	const completedIdx = source.indexOf('case "checkout.session.completed"');
	const staffIdx = source.indexOf("isStaffTuitionSession(session)", completedIdx);
	const activateIdx = source.indexOf("activateMembership", completedIdx);
	assert.ok(completedIdx > 0);
	assert.ok(staffIdx > completedIdx);
	assert.ok(activateIdx > staffIdx);
});

test("fees panel links to staff pay", async () => {
	const source = await readFile(
		new URL("../../src/components/admin/AdminFeesPanel.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /\/staff\/pay/);
});

test("wechat landing is a tappable pay page not a browser-only wall", async () => {
	const source = await readFile(new URL("../../src/app/p/[token]/page.tsx", import.meta.url), "utf8");
	assert.match(source, /去支付/);
	assert.match(source, /checkout_url/);
	assert.doesNotMatch(source, /请用系统浏览器打开/);
});

test("cjkzt login offers password form when email is unavailable", async () => {
	const source = await readFile(
		new URL("../../src/app/cjkzt/(public)/login/page.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /AdminPasswordLoginForm/);
	assert.match(source, /redirectTo=\{nextPath\}/);
});

test("staff pay create route uses mainland origin not NEXT_PUBLIC_APP_URL", async () => {
	const source = await readFile(
		new URL("../../src/app/api/staff/pay/route.ts", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(source, /NEXT_PUBLIC_APP_URL/);
	assert.doesNotMatch(source, /stripe\.checkout\.sessions\.create/);
	assert.match(source, /createStaffStripeCheckoutSession/);
	const lib = await readFile(new URL("../../src/lib/staff-pay/staff-pay.ts", import.meta.url), "utf8");
	assert.match(lib, /api\.stripe\.com\/v1\/checkout\/sessions/);
	assert.doesNotMatch(source, /requireAdminSession/);
	assert.match(source, /requireStaffPaySession/);
	assert.match(source, /resolveStaffPayOrigin/);
});

test("staff pay page is a password gate not an admin email login", async () => {
	const page = await readFile(new URL("../../src/app/staff/pay/page.tsx", import.meta.url), "utf8");
	assert.doesNotMatch(page, /cjkzt\/login/);
	assert.doesNotMatch(page, /getAdminSession/);
	assert.match(page, /hasValidStaffPayCookie/);

	const login = await readFile(
		new URL("../../src/app/api/staff/pay/login/route.ts", import.meta.url),
		"utf8",
	);
	assert.match(login, /STAFF_PAY_COOKIE/);
	assert.match(login, /isStaffPayPassword/);
	assert.match(login, /requireStaffPayCsrf/);
});
