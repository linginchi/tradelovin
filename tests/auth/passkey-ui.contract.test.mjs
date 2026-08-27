import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const passkeyApiFiles = [
	"src/app/api/auth/passkey/status/route.ts",
	"src/app/api/auth/passkey/register/options/route.ts",
	"src/app/api/auth/passkey/register/verify/route.ts",
	"src/app/api/auth/passkey/login/options/route.ts",
	"src/app/api/auth/passkey/login/verify/route.ts",
];

test("passkey API route files exist", () => {
	for (const rel of passkeyApiFiles) {
		assert.equal(existsSync(join(root, rel)), true, `missing ${rel}`);
	}
});

test("login/verify reuses establishMagicLinkSession and skips magic-link tokens", () => {
	const verifySrc = readFileSync(
		join(root, "src/app/api/auth/passkey/login/verify/route.ts"),
		"utf8",
	);
	assert.match(verifySrc, /establishMagicLinkSession/);
	assert.doesNotMatch(verifySrc, /consumeMagicLink/);
	assert.doesNotMatch(verifySrc, /email_login_tokens/);
});

test("register/options does not exclude the existing cred on replace", () => {
	const src = readFileSync(join(root, "src/app/api/auth/passkey/register/options/route.ts"), "utf8");
	assert.match(src, /registrationExcludeCredentials/);
	assert.doesNotMatch(src, /id:\s*existing\.credential_id/);
});

test("register/verify upserts on user_id,rp_id instead of delete-then-insert", () => {
	const src = readFileSync(join(root, "src/app/api/auth/passkey/register/verify/route.ts"), "utf8");
	assert.match(src, /\.upsert\(/);
	assert.match(src, /onConflict:\s*["']user_id,\s*rp_id["']/);
	assert.doesNotMatch(src, /\.delete\(\)/);
});

test("login/verify CAS-updates sign_count and checks consume result", () => {
	const verifySrc = readFileSync(join(root, "src/app/api/auth/passkey/login/verify/route.ts"), "utf8");
	const apiSrc = readFileSync(join(root, "src/lib/auth/passkey-api.ts"), "utf8");
	assert.match(verifySrc, /casUpdatePasskeySignCount/);
	assert.match(verifySrc, /if\s*\(\s*!consumed/);
	assert.match(apiSrc, /eq\("sign_count"/);
	assert.match(apiSrc, /\.select\("id"\)/);
});

test("login, layout, and profile wire passkey UI", () => {
	const loginPage = readFileSync(join(root, "src/app/[locale]/login/page.tsx"), "utf8");
	const layout = readFileSync(join(root, "src/app/[locale]/layout.tsx"), "utf8");
	const profile = readFileSync(join(root, "src/app/[locale]/my-profile/page.tsx"), "utf8");
	assert.match(loginPage, /PasskeyLoginButton/);
	assert.match(loginPage, /LocalDevLoginNotice/);
	assert.match(loginPage, /defaultValue=\{localDev \? "password" : "email-link"\}/);
	assert.match(layout, /PasskeyEnrollPrompt/);
	assert.match(profile, /ProfilePasskeySection/);
});

test("passkey login surfaces not_enrolled and explains email-first bind", () => {
	const browser = readFileSync(join(root, "src/lib/auth/passkey-browser.ts"), "utf8");
	const button = readFileSync(join(root, "src/components/auth/PasskeyLoginButton.tsx"), "utf8");
	assert.match(browser, /throwPasskeyApiError/);
	assert.match(browser, /json\.code/);
	assert.match(button, /passkeyNeedsEnroll/);
	assert.match(button, /passkeyMissingServiceRole/);
	assert.match(button, /passkeyLoginHint/);
});

test("localhost Google login is blocked before OAuth", () => {
	const google = readFileSync(join(root, "src/components/auth/GoogleLoginButton.tsx"), "utf8");
	assert.match(google, /isLocalDevAuthHost/);
	assert.match(google, /googleLocalBlocked/);
	const oauthIdx = google.indexOf("signInWithOAuth");
	const guardIdx = google.indexOf("isLocalDevAuthHost");
	assert.ok(guardIdx >= 0 && oauthIdx > guardIdx, "local host guard must run before OAuth");
});
