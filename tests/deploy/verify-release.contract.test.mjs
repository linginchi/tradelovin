import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_MAX_ATTEMPTS,
	DEFAULT_RETRY_DELAY_MS,
	waitForExpectedReleaseSha,
} from "../../scripts/deploy/verify-release.mjs";

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
