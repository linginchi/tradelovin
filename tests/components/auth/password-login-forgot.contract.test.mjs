import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);

test("password login form exposes forgot-password affordance via magic-link send", async () => {
	const source = await readFile(new URL("src/components/auth/PasswordLoginForm.tsx", root), "utf8");
	assert.match(source, /forgotPassword/);
	assert.match(source, /\/api\/auth\/send-login-link/);
	assert.match(source, /\/my-profile/);
});

test("login copy includes forgot-password strings in zh/en/zh-TW", async () => {
	for (const locale of ["zh.json", "en.json", "zh-TW.json"]) {
		const source = await readFile(new URL(`messages/${locale}`, root), "utf8");
		assert.match(source, /"forgotPassword"/);
		assert.match(source, /"forgotPasswordSent"/);
		assert.match(source, /"forgotPasswordHint"/);
	}
});
