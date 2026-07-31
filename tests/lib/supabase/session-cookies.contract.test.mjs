import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(join(root, "src/lib/supabase/session.ts"), "utf8");

test("session helper writes chunked base64url sb-* cookies", () => {
	assert.match(source, /writeSupabaseSessionCookies/);
	assert.match(source, /createChunks/);
	assert.match(source, /stringToBase64URL/);
	assert.match(source, /sb-\$\{ref\}-auth-token/);
});
