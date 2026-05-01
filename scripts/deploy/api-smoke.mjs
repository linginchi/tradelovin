#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? "").trim().replace(/\/+$/, "");
const userCookie = (process.env.USER_COOKIE ?? "").trim();
const cronKey = (process.env.TQ_CRON_API_KEY ?? "").trim();

if (!baseUrl) {
	console.error("Missing BASE_URL. Example: BASE_URL=https://tradelovin.com node scripts/deploy/api-smoke.mjs");
	process.exit(1);
}

const endpoints = [
	{ name: "membership me", method: "GET", path: "/api/membership/me", needsUserCookie: true },
	{ name: "trade account", method: "GET", path: "/api/trade/account", needsUserCookie: true },
	{ name: "tq score", method: "GET", path: "/api/tq/score", needsUserCookie: true },
	{ name: "tq import live", method: "POST", path: "/api/tq/import-live", needsUserCookie: true, body: {} },
	{
		name: "tq recalculate cron",
		method: "POST",
		path: "/api/tq/cron/recalculate",
		headers: cronKey ? { "x-tq-cron-key": cronKey } : {},
		body: {},
	},
];

async function requestOne(item) {
	const headers = {
		"Content-Type": "application/json",
		...(item.headers ?? {}),
	};
	if (item.needsUserCookie) {
		if (!userCookie) {
			console.error(`SKIP ${item.name}: missing USER_COOKIE`);
			return { ok: false, skipped: true };
		}
		headers.Cookie = userCookie;
	}
	if (item.name === "tq recalculate cron" && !cronKey) {
		console.error("SKIP tq recalculate cron: missing TQ_CRON_API_KEY");
		return { ok: false, skipped: true };
	}

	const url = `${baseUrl}${item.path}`;
	const res = await fetch(url, {
		method: item.method,
		headers,
		body: item.method === "POST" ? JSON.stringify(item.body ?? {}) : undefined,
	});
	let payload = "";
	try {
		payload = await res.text();
	} catch {
		// ignore
	}

	const ok = res.ok;
	const detail = payload.slice(0, 240).replace(/\s+/g, " ");
	console.log(`${ok ? "PASS" : "FAIL"} ${item.name} -> ${res.status} ${item.path}${detail ? ` | ${detail}` : ""}`);
	return { ok, skipped: false };
}

const results = [];
for (const endpoint of endpoints) {
	try {
		results.push(await requestOne(endpoint));
	} catch (error) {
		console.error(`FAIL ${endpoint.name}: ${error instanceof Error ? error.message : String(error)}`);
		results.push({ ok: false, skipped: false });
	}
}

const failed = results.some((r) => !r.ok && !r.skipped);
if (failed) {
	process.exit(1);
}
console.log("API smoke checks completed.");
