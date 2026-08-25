import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_MAX_ATTEMPTS,
	DEFAULT_RETRY_DELAY_MS,
	parseVersionPayload,
	verifyRelease,
	waitForExpectedReleaseSha,
} from "../../scripts/deploy/verify-release.mjs";

const SHA = "01911cb5e44cd7ed74a794f93781cc4abafa183d";

function versionBody({ sha = SHA, videoPlayback = true } = {}) {
	return JSON.stringify({
		success: true,
		data: {
			release: { sha, source: "github-actions", time: "1-1" },
			features: { legacyScoreAlias: true, tqCertificates: true, videoPlayback },
		},
	});
}

/** Stub the endpoints verifyRelease touches; `overrides` replaces one response. */
function stubFetch(overrides = {}) {
	const calls = [];
	const routes = {
		"/api/deploy/version": { ok: true, status: 200, text: versionBody() },
		"/api/fdt-score": { ok: true, status: 200, text: JSON.stringify({ data: [] }) },
		"/api/auth/dev-test-login": {
			ok: true,
			status: 200,
			text: JSON.stringify({ enabled: false }),
		},
		...overrides,
	};
	const fetchImpl = async (url) => {
		const path = new URL(url).pathname;
		calls.push(path);
		const match = Object.keys(routes).find((key) => path.startsWith(key));
		const res = routes[match];
		return { ok: res.ok, status: res.status, text: async () => res.text };
	};
	return { fetchImpl, calls };
}

function silentLog() {
	const errors = [];
	return { log: { log: () => {}, error: (m) => errors.push(String(m)) }, errors };
}

test("defaults bound total attempts and wait ceiling", () => {
	assert.equal(DEFAULT_MAX_ATTEMPTS, 8);
	assert.equal(DEFAULT_RETRY_DELAY_MS, 2000);
	const maxWaitMs = (DEFAULT_MAX_ATTEMPTS - 1) * DEFAULT_RETRY_DELAY_MS;
	assert.equal(maxWaitMs, 14000);
	assert.ok(maxWaitMs <= 20_000, "total backoff wait must stay bounded");
});

test("first unknown then matching SHA succeeds after limited retries", async () => {
	const expected = "01911cb5e44cd7ed74a794f93781cc4abafa183d";
	const shas = ["unknown", expected];
	const sleeps = [];
	let calls = 0;

	const result = await waitForExpectedReleaseSha({
		expectedSha: expected,
		fetchVersionSha: async () => {
			calls += 1;
			return shas.shift() ?? "unknown";
		},
		sleep: async (ms) => {
			sleeps.push(ms);
		},
		maxAttempts: 8,
		retryDelayMs: 2000,
	});

	assert.equal(result.ok, true);
	assert.equal(result.attempts, 2);
	assert.equal(result.actualSha, expected);
	assert.equal(calls, 2);
	assert.deepEqual(sleeps, [2000]);
});

test("persistent mismatch fails after max attempts and never treats mismatch as success", async () => {
	const expected = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const sleeps = [];
	let calls = 0;

	const result = await waitForExpectedReleaseSha({
		expectedSha: expected,
		fetchVersionSha: async () => {
			calls += 1;
			return "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		},
		sleep: async (ms) => {
			sleeps.push(ms);
		},
		maxAttempts: 8,
		retryDelayMs: 2000,
	});

	assert.equal(result.ok, false);
	assert.equal(result.attempts, 8);
	assert.equal(result.actualSha, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
	assert.notEqual(result.actualSha, expected);
	assert.equal(calls, 8);
	assert.equal(sleeps.length, 7);
	assert.ok(sleeps.every((ms) => ms === 2000));
});

test("release passes when the deployed Worker still has video playback configured", async () => {
	const { fetchImpl, calls } = stubFetch();
	const { log, errors } = silentLog();

	const code = await verifyRelease({
		baseUrl: "https://leolearnstotrade.com",
		expectedSha: SHA,
		fetchImpl,
		log,
	});

	assert.equal(code, 0, errors.join("\n"));
	assert.ok(calls.includes("/api/deploy/version"), "must read the version payload");
});

test("release fails when the Worker cannot sign any play URL", async () => {
	const { fetchImpl } = stubFetch({
		"/api/deploy/version": {
			ok: true,
			status: 200,
			text: versionBody({ videoPlayback: false }),
		},
	});
	const { log, errors } = silentLog();

	const code = await verifyRelease({
		baseUrl: "https://leolearnstotrade.com",
		expectedSha: SHA,
		fetchImpl,
		log,
	});

	assert.equal(code, 1, "unconfigured video playback must fail the release");
	const message = errors.join("\n");
	assert.match(message, /SUPABASE_SERVICE_ROLE_KEY/, "error must name the legacy backend secret");
	assert.match(message, /VIDEO_STORAGE_/, "error must name the object-store secrets");
	assert.match(message, /[Ss]ecret/, "error must say these belong in Worker secrets");
});

test("a build predating the videoPlayback flag is not treated as configured", async () => {
	// Absent flag is indistinguishable from unconfigured, so fail closed.
	const { fetchImpl } = stubFetch({
		"/api/deploy/version": {
			ok: true,
			status: 200,
			text: JSON.stringify({
				success: true,
				data: { release: { sha: SHA }, features: { legacyScoreAlias: true } },
			}),
		},
	});
	const { log } = silentLog();

	const code = await verifyRelease({
		baseUrl: "https://leolearnstotrade.com",
		expectedSha: SHA,
		fetchImpl,
		log,
	});

	assert.equal(code, 1, "missing videoPlayback flag must fail closed");
});

test("version payload parsing keeps release sha and feature flags together", () => {
	const parsed = parseVersionPayload(versionBody({ videoPlayback: false }));
	assert.equal(parsed.error, null);
	assert.equal(parsed.sha, SHA);
	assert.equal(parsed.features.videoPlayback, false);

	const broken = parseVersionPayload("not json");
	assert.equal(broken.error, "invalid_json");
	assert.deepEqual(broken.features, {});
});

test("immediate SHA match succeeds without sleeping or extra retries", async () => {
	const expected = "cccccccccccccccccccccccccccccccccccccccc";
	const sleeps = [];
	let calls = 0;

	const result = await waitForExpectedReleaseSha({
		expectedSha: expected,
		fetchVersionSha: async () => {
			calls += 1;
			return expected;
		},
		sleep: async (ms) => {
			sleeps.push(ms);
		},
		maxAttempts: 8,
		retryDelayMs: 2000,
	});

	assert.equal(result.ok, true);
	assert.equal(result.attempts, 1);
	assert.equal(result.actualSha, expected);
	assert.equal(calls, 1);
	assert.deepEqual(sleeps, []);
});
