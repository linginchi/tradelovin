import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("middleware wires legacy overseas redirect helper and does not hardcode xeoaxis as legacy", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /buildLegacyOverseasRedirectUrl/);
	assert.match(source, /isHttpsOnlyHost/);
	assert.doesNotMatch(source, /LEGACY_HOSTNAMES\s*=\s*\[[^\]]*xeoaxis/);
	assert.doesNotMatch(source, /CANONICAL_HOSTNAME\s*=\s*["']xeoaxis/);
});
