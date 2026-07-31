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

test("matcher admits skipped paths and returns before application routing", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /matcher:\s*\[\s*"\/:path\*"\s*\]/);
	assert.match(source, /api|_next|_vercel|auth/);
	assert.match(source, /pathname\.includes\("\."\)/);
	assert.match(source, /if \(shouldSkipMiddlewarePath\(pathname\)\)[\s\S]*?return NextResponse\.next\(\);/);
});

test("legacy overseas redirects are opt-in and include skipped legacy paths", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /ENABLE_LEGACY_OVERSEAS_REDIRECT/);
	assert.match(source, /["']1["']\s*\|\|\s*[^;]*["']true["']/);
	assert.match(
		source,
		/legacyOverseasRedirectEnabled\s*\?\s*buildLegacyOverseasRedirectUrl/,
	);
	assert.match(source, /shouldBypassLegacyOverseasRedirect/);
	assert.match(source, /\/auth\/callback/);
	assert.match(source, /\/auth\/handoff/);
	assert.match(source, /\/api\/auth\/magic-link/);
	assert.match(
		source,
		/if \(shouldSkipMiddlewarePath\(pathname\)\)[\s\S]*?if \(legacyOverseas && !shouldBypassLegacyOverseasRedirect\(pathname\)\)[\s\S]*?return NextResponse\.redirect[\s\S]*?return NextResponse\.next\(\);[\s\S]*?if \(process\.env\.NODE_ENV === "production"\)/,
	);
});
