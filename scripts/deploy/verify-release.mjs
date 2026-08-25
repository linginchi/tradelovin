#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_RETRY_DELAY_MS = 2000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll /api/deploy/version until release.sha matches expectedSha, or attempts are exhausted.
 * Injectable fetchVersionSha + sleep keep Cloudflare propagation retries unit-testable.
 */
export async function waitForExpectedReleaseSha({
	expectedSha,
	fetchVersionSha,
	sleep = defaultSleep,
	maxAttempts = DEFAULT_MAX_ATTEMPTS,
	retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
	const expected = String(expectedSha ?? "").trim();
	if (!expected) {
		throw new Error("Missing EXPECTED_SHA");
	}
	if (typeof fetchVersionSha !== "function") {
		throw new Error("fetchVersionSha is required");
	}
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new Error("maxAttempts must be a positive integer");
	}
	if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
		throw new Error("retryDelayMs must be a non-negative integer");
	}

	let actualSha = "";
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		actualSha = String((await fetchVersionSha()) ?? "");
		if (actualSha === expected) {
			return { ok: true, attempts: attempt, actualSha };
		}
		if (attempt < maxAttempts) {
			await sleep(retryDelayMs);
		}
	}

	return { ok: false, attempts: maxAttempts, actualSha };
}

async function check(baseUrl, path, fetchImpl) {
	const res = await fetchImpl(`${baseUrl}${path}`);
	const text = await res.text();
	return { ok: res.ok, status: res.status, text };
}

export function parseVersionPayload(text) {
	let versionJson = null;
	try {
		versionJson = JSON.parse(text);
	} catch {
		return { error: "invalid_json", sha: "", features: {} };
	}
	return {
		error: null,
		sha: String(versionJson?.data?.release?.sha ?? ""),
		features: versionJson?.data?.features ?? {},
	};
}

export async function verifyRelease({
	baseUrl,
	expectedSha,
	fetchImpl = globalThis.fetch.bind(globalThis),
	sleep = defaultSleep,
	maxAttempts = DEFAULT_MAX_ATTEMPTS,
	retryDelayMs = DEFAULT_RETRY_DELAY_MS,
	log = console,
} = {}) {
	const normalizedBase = String(baseUrl ?? "")
		.trim()
		.replace(/\/+$/, "");
	const expected = String(expectedSha ?? "").trim();

	if (!normalizedBase) {
		log.error("Missing BASE_URL");
		return 1;
	}
	if (!expected) {
		log.error("Missing EXPECTED_SHA");
		return 1;
	}

	const wait = await waitForExpectedReleaseSha({
		expectedSha: expected,
		maxAttempts,
		retryDelayMs,
		sleep,
		fetchVersionSha: async () => {
			const versionRes = await check(normalizedBase, "/api/deploy/version", fetchImpl);
			if (!versionRes.ok) {
				throw new Error(`version_http_${versionRes.status}`);
			}
			const parsed = parseVersionPayload(versionRes.text);
			if (parsed.error === "invalid_json") {
				throw new Error("version_invalid_json");
			}
			return parsed.sha;
		},
	}).catch((err) => {
		const message = String(err?.message ?? err);
		if (message.startsWith("version_http_")) {
			log.error(`FAIL /api/deploy/version -> ${message.slice("version_http_".length)}`);
			return { ok: false, attempts: 0, actualSha: "", fatal: true, code: 1 };
		}
		if (message === "version_invalid_json") {
			log.error("FAIL /api/deploy/version invalid JSON");
			return { ok: false, attempts: 0, actualSha: "", fatal: true, code: 1 };
		}
		throw err;
	});

	if (wait?.fatal) {
		return wait.code ?? 1;
	}
	if (!wait.ok) {
		log.error(
			`FAIL release sha mismatch after ${wait.attempts} attempt(s): expected=${expected} actual=${wait.actualSha || "unknown"}`,
		);
		return 1;
	}

	// A deploy that drops VIDEO_STORAGE_* still serves every page; only course
	// playback breaks, so without this gate users report it before CI does.
	const featureRes = await check(normalizedBase, "/api/deploy/version", fetchImpl);
	const featureParsed = parseVersionPayload(featureRes.text);
	if (featureParsed.error === "invalid_json") {
		log.error("FAIL /api/deploy/version invalid JSON");
		return 1;
	}
	if (featureParsed.features?.videoPlayback !== true) {
		log.error(
			"FAIL video playback not configured: the Worker cannot sign play URLs. Set SUPABASE_SERVICE_ROLE_KEY (legacy Supabase Videos) and/or VIDEO_STORAGE_* as Worker *Secrets* (plain vars are wiped by wrangler deploy). See DEPLOY.md 6.1.",
		);
		return 1;
	}

	const fdtRes = await check(normalizedBase, "/api/fdt-score?env=sim&period=all", fetchImpl);
	if (fdtRes.status === 404) {
		log.error("FAIL /api/fdt-score still 404 (legacy alias missing)");
		return 1;
	}

	const devTestRes = await check(normalizedBase, "/api/auth/dev-test-login", fetchImpl);
	if (!devTestRes.ok) {
		log.error(`FAIL /api/auth/dev-test-login -> ${devTestRes.status}`);
		return 1;
	}
	try {
		const devJson = JSON.parse(devTestRes.text);
		if (typeof devJson.enabled !== "boolean") {
			log.error("FAIL /api/auth/dev-test-login missing enabled field");
			return 1;
		}
	} catch {
		log.error("FAIL /api/auth/dev-test-login invalid JSON");
		return 1;
	}

	log.log("Release verification passed.");
	return 0;
}

const isMain =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const code = await verifyRelease({
		baseUrl: process.env.BASE_URL,
		expectedSha: process.env.EXPECTED_SHA,
	});
	process.exit(code);
}
