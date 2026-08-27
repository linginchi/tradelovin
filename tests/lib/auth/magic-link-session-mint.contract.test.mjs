import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(join(root, "src/lib/auth/magic-link.ts"), "utf8");

test("magic-link mints session via generateLink + verifyOtp and writes cookies directly", () => {
	assert.match(source, /admin\.generateLink\(/);
	assert.match(source, /verifyOtp\(/);
	assert.match(source, /createEphemeralAnonClient/);
	assert.match(source, /writeSupabaseSessionCookies\(/);
	// Cookie-adapter auth on Workers was the production failure mode.
	assert.doesNotMatch(source, /cookieClient\.auth\.signInWithPassword/);
	assert.doesNotMatch(source, /\.auth\.setSession\(/);
});

test("consumeMagicLink still burns email_login_tokens after session mint", () => {
	assert.match(source, /export async function consumeMagicLink/);
	assert.match(source, /from\("email_login_tokens"\)/);
	assert.match(source, /establishMagicLinkSession/);
	const consumeIdx = source.indexOf("export async function consumeMagicLink");
	const burnIdx = source.indexOf("update({ used: true })", consumeIdx);
	const establishIdx = source.indexOf("establishMagicLinkSession", consumeIdx);
	assert.ok(establishIdx > consumeIdx);
	assert.ok(burnIdx > establishIdx);
});

test("send-login-link and HTML hop still point at /auth/magic-link", async () => {
	const { readFileSync } = await import("node:fs");
	const send = readFileSync(join(root, "src/app/api/auth/send-login-link/route.ts"), "utf8");
	const hop = readFileSync(join(root, "src/app/auth/magic-link/route.ts"), "utf8");
	const api = readFileSync(join(root, "src/app/api/auth/magic-link/route.ts"), "utf8");
	assert.match(send, /\/auth\/magic-link\?token=/);
	assert.match(hop, /\/api\/auth\/magic-link/);
	assert.match(api, /consumeMagicLink/);
	assert.doesNotMatch(api, /passkey/);
});
