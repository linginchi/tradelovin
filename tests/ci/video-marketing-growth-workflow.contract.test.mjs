import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const MARKETING_WF = ".github/workflows/video-marketing-growth.yml";

const read = (path) => readFile(new URL(path, root), "utf8");

/**
 * Extract the shell script of the trigger step (between `run: |` and end of file /
 * next top-level YAML key under the step is not needed — workflow is single-step).
 */
function extractRunScript(yaml) {
	const marker = "run: |";
	const idx = yaml.indexOf(marker);
	assert.ok(idx >= 0, "workflow must define a run: | script");
	return yaml.slice(idx + marker.length);
}

test("missing base URL or cron key fails the job with exit 1 before curl", async () => {
	const yaml = await read(MARKETING_WF);
	const script = extractRunScript(yaml);

	assert.match(
		script,
		/VIDEO_MARKETING_GROWTH_BASE_URL/,
		"script must check base URL",
	);
	assert.match(
		script,
		/VIDEO_MARKETING_GROWTH_CRON_KEY/,
		"script must check cron key",
	);

	// Both missing-config branches must hard-fail.
	const baseUrlFail = script.match(
		/if \[ -z "\$\{VIDEO_MARKETING_GROWTH_BASE_URL:-\}" \]; then([\s\S]*?)fi/,
	);
	const cronKeyFail = script.match(
		/if \[ -z "\$\{VIDEO_MARKETING_GROWTH_CRON_KEY:-\}" \]; then([\s\S]*?)fi/,
	);
	assert.ok(baseUrlFail, "must guard empty VIDEO_MARKETING_GROWTH_BASE_URL");
	assert.ok(cronKeyFail, "must guard empty VIDEO_MARKETING_GROWTH_CRON_KEY");
	assert.match(baseUrlFail[1], /exit 1/, "missing base URL must exit 1");
	assert.match(cronKeyFail[1], /exit 1/, "missing cron key must exit 1");
	assert.ok(!/exit 0/.test(baseUrlFail[1]), "missing base URL must not exit 0");
	assert.ok(!/exit 0/.test(cronKeyFail[1]), "missing cron key must not exit 0");
	assert.match(baseUrlFail[1], /ERROR|Missing/i, "missing base URL must print a clear error");
	assert.match(cronKeyFail[1], /ERROR|Missing/i, "missing cron key must print a clear error");

	// curl must appear only after both guards (not inside either failure branch).
	assert.ok(!/curl\b/.test(baseUrlFail[1]), "must not curl when base URL is missing");
	assert.ok(!/curl\b/.test(cronKeyFail[1]), "must not curl when cron key is missing");
	assert.match(script, /\bcurl\b/, "configured path must still curl the cron endpoint");

	const curlIdx = script.search(/\bcurl\b/);
	const baseGuardIdx = script.indexOf("VIDEO_MARKETING_GROWTH_BASE_URL:-");
	const keyGuardIdx = script.indexOf("VIDEO_MARKETING_GROWTH_CRON_KEY:-");
	assert.ok(baseGuardIdx >= 0 && keyGuardIdx >= 0 && curlIdx > baseGuardIdx && curlIdx > keyGuardIdx);
});

test("cron key is only passed via request header and never echoed", async () => {
	const yaml = await read(MARKETING_WF);
	const script = extractRunScript(yaml);

	assert.match(
		script,
		/-H\s+"x-video-marketing-growth-cron-key:\s*\$\{VIDEO_MARKETING_GROWTH_CRON_KEY\}"/,
	);
	// Error text may mention the secret *name*; never interpolate the value into echo.
	assert.ok(
		!/echo\s+".*\$\{VIDEO_MARKETING_GROWTH_CRON_KEY\}/.test(script),
		"must not echo the cron key value",
	);
	assert.ok(
		!/echo\s+\$\{VIDEO_MARKETING_GROWTH_CRON_KEY\}/.test(script),
		"must not echo the cron key value bare",
	);
	assert.ok(
		!/VIDEO_MARKETING_GROWTH_CRON_KEY\s*[:=]\s*["'][^"']+["']/.test(yaml),
		"cron key must not be hardcoded in the workflow",
	);
	assert.match(script, /curl\s+-fsS/, "curl -f must fail the step on non-2xx");
	assert.match(script, /\/api\/cron\/video-marketing-growth/);
	assert.ok(!yaml.includes("/api/tq/cron/recalculate"), "must not trigger TQ");
});
