#!/usr/bin/env node
/**
 * Minimal IDOR smoke checks against user-scoped APIs.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 USER_A_COOKIE="sb-..." USER_B_COOKIE="sb-..." node scripts/security/idor-smoke.mjs
 */

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const cookieA = process.env.USER_A_COOKIE || "";
const cookieB = process.env.USER_B_COOKIE || "";

if (!cookieA || !cookieB) {
	console.error("Missing USER_A_COOKIE or USER_B_COOKIE");
	process.exit(1);
}

const endpoints = [
	"/api/courses/my-registrations",
	"/api/courses/my-scores",
	"/api/job/my-application",
	"/api/trade/orders",
	"/api/trade/positions",
];

async function call(path, cookie) {
	const res = await fetch(`${baseUrl}${path}`, {
		headers: { Cookie: cookie },
	});
	let body = null;
	try {
		body = await res.json();
	} catch {
		body = null;
	}
	return { status: res.status, body };
}

function stableShape(v) {
	return JSON.stringify(v, (_, value) => {
		if (typeof value === "string" && value.length > 48) return "<redacted>";
		return value;
	});
}

let failed = 0;
for (const ep of endpoints) {
	const a = await call(ep, cookieA);
	const b = await call(ep, cookieB);

	if (a.status !== 200 || b.status !== 200) {
		console.error(`[WARN] ${ep} non-200`, { a: a.status, b: b.status });
		failed += 1;
		continue;
	}

	const same = stableShape(a.body) === stableShape(b.body);
	if (same) {
		console.error(`[FAIL] ${ep} returned identical payload shape/content for two users`);
		failed += 1;
	} else {
		console.log(`[PASS] ${ep}`);
	}
}

if (failed > 0) {
	console.error(`IDOR smoke failed: ${failed} endpoint(s) suspicious`);
	process.exit(2);
}

console.log("IDOR smoke checks passed");
