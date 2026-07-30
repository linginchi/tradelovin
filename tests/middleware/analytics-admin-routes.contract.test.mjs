import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("middleware keeps analytics login/dashboard routes available", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /\/admin\/analytics/);
	assert.match(source, /\/admin\/login/);
	assert.match(source, /pathname === "\/admin"/);
	assert.match(source, /url\.pathname = "\/admin\/login"/);
	assert.doesNotMatch(
		source,
		/if \(pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)\) \{\s*return new NextResponse\(null, \{ status: 404 \}\)/,
	);
});

test("admin jwt and analytics guard accept analytics role", async () => {
	const jwt = await readFile(new URL("../../src/lib/auth/admin-jwt.ts", import.meta.url), "utf8");
	const guard = await readFile(new URL("../../src/lib/auth/admin-api-guard.ts", import.meta.url), "utf8");
	assert.match(jwt, /"analytics"/);
	assert.match(guard, /requireAnalyticsSession/);
	assert.match(guard, /session\.role !== "analytics"/);
});
