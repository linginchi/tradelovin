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
