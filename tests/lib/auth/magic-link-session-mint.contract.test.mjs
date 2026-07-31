import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(join(root, "src/lib/auth/magic-link.ts"), "utf8");

test("magic-link mints session via generateLink + verifyOtp, not SSR signInWithPassword alone", () => {
	assert.match(source, /admin\.generateLink\(/);
	assert.match(source, /verifyOtp\(/);
	assert.match(source, /createEphemeralAnonClient/);
	assert.match(source, /setSession\(/);
	// Cookie-adapter password grant was the production failure mode on Workers.
	assert.doesNotMatch(source, /cookieClient\.auth\.signInWithPassword/);
});
