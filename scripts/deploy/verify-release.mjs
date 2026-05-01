#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? "").trim().replace(/\/+$/, "");
const expectedSha = (process.env.EXPECTED_SHA ?? "").trim();

if (!baseUrl) {
	console.error("Missing BASE_URL");
	process.exit(1);
}
if (!expectedSha) {
	console.error("Missing EXPECTED_SHA");
	process.exit(1);
}

async function check(path) {
	const res = await fetch(`${baseUrl}${path}`);
	const text = await res.text();
	return { ok: res.ok, status: res.status, text };
}

const versionRes = await check("/api/deploy/version");
if (!versionRes.ok) {
	console.error(`FAIL /api/deploy/version -> ${versionRes.status}`);
	process.exit(1);
}
let versionJson = null;
try {
	versionJson = JSON.parse(versionRes.text);
} catch {
	console.error("FAIL /api/deploy/version invalid JSON");
	process.exit(1);
}
const actualSha = String(versionJson?.data?.release?.sha ?? "");
if (actualSha !== expectedSha) {
	console.error(`FAIL release sha mismatch: expected=${expectedSha} actual=${actualSha}`);
	process.exit(1);
}

const fdtRes = await check("/api/fdt-score?env=sim&period=all");
if (fdtRes.status === 404) {
	console.error("FAIL /api/fdt-score still 404 (legacy alias missing)");
	process.exit(1);
}

const devTestRes = await check("/api/auth/dev-test-login");
if (!devTestRes.ok) {
	console.error(`FAIL /api/auth/dev-test-login -> ${devTestRes.status}`);
	process.exit(1);
}
try {
	const devJson = JSON.parse(devTestRes.text);
	if (typeof devJson.enabled !== "boolean") {
		console.error("FAIL /api/auth/dev-test-login missing enabled field");
		process.exit(1);
	}
} catch {
	console.error("FAIL /api/auth/dev-test-login invalid JSON");
	process.exit(1);
}

console.log("Release verification passed.");

