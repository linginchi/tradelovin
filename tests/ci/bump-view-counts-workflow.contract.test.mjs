import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const BUMP_WF = ".github/workflows/bump-view-counts.yml";

const read = (path) => readFile(new URL(path, root), "utf8");

/** Return the workflow's single `run: |` script, dedented so blocks sit at column 0. */
function extractRunScript(yaml) {
	const marker = "run: |";
	const idx = yaml.indexOf(marker);
	assert.ok(idx >= 0, "workflow must define a run: | script");
	const lines = yaml
		.slice(idx + marker.length)
		.replace(/^\r?\n/, "")
		.split(/\r?\n/);
	const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
	const base = Math.min(...indents);
	return lines.map((l) => l.slice(base)).join("\n");
}

function matchBlock(script, pattern, label) {
	const found = script.match(pattern);
	assert.ok(found, `${label} block not found`);
	return found[1];
}

/** Join the curl invocation's backslash-continued lines into one flag string. */
function extractCurlCommand(script) {
	const code = script
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("#"))
		.join("\n");
	const found = code.match(/curl (?:[^\n]*\\\n)*[^\n]*/);
	assert.ok(found, "workflow must invoke curl");
	return found[0].replace(/\\\n\s*/g, " ");
}

test("missing base URL fails the job before curl", async () => {
	const script = extractRunScript(await read(BUMP_WF));
	const branch = matchBlock(
		script,
		/if \[ -z "\$\{BUMP_VIEW_COUNTS_BASE_URL:-\}" \]; then\n([\s\S]*?)\nfi\n/,
		"missing base URL",
	);

	assert.match(branch, /exit 1/, "missing base URL must exit 1");
	assert.ok(!/exit 0/.test(branch), "missing base URL must not exit 0");
	assert.ok(!/curl\b/.test(branch), "must not curl when base URL is missing");
	assert.match(branch, /ERROR|Missing|error::/i, "missing base URL must print a clear error");
});

test("missing every cron credential fails the job with an actionable error", async () => {
	const script = extractRunScript(await read(BUMP_WF));
	const branch = matchBlock(script, /\nelse\n([\s\S]*?)\nfi\n/, "missing credential");

	assert.match(branch, /exit 1/, "missing credential must exit 1");
	assert.ok(!/exit 0/.test(branch), "missing credential must not exit 0");
	assert.ok(!/curl\b/.test(branch), "must not curl without a credential");
	assert.match(
		branch,
		/VIEW_COUNT_CRON_KEY/,
		"error must name the secret an operator has to add",
	);
});

test("credential order matches the route's authorize() precedence", async () => {
	const script = extractRunScript(await read(BUMP_WF));
	const route = await read("src/app/api/cron/bump-view-counts/route.ts");

	// Route reads VIEW_COUNT_CRON_KEY ?? TQ_CRON_API_KEY for the x-cron-key header.
	assert.match(route, /VIEW_COUNT_CRON_KEY\s*\?\?\s*process\.env\.TQ_CRON_API_KEY/);
	assert.match(route, /x-internal-token/);
	assert.match(route, /x-cron-key/);

	const viewKeyIdx = script.indexOf("VIEW_COUNT_CRON_KEY:-");
	const tqKeyIdx = script.indexOf("TQ_CRON_API_KEY:-");
	assert.ok(viewKeyIdx >= 0 && tqKeyIdx >= 0, "workflow must probe both cron key names");
	assert.ok(
		viewKeyIdx < tqKeyIdx,
		"VIEW_COUNT_CRON_KEY must be preferred, matching server-side precedence",
	);

	assert.match(script, /auth_header="x-internal-token"/);
	assert.match(script, /auth_header="x-cron-key"/);
});

test("curl runs only after both guards and targets the bump endpoint", async () => {
	const script = extractRunScript(await read(BUMP_WF));

	const curlIdx = script.search(/\bcurl\b/);
	const baseGuardIdx = script.indexOf("BUMP_VIEW_COUNTS_BASE_URL:-");
	const keyGuardIdx = script.indexOf("VIEW_COUNT_CRON_KEY:-");
	assert.ok(baseGuardIdx >= 0 && keyGuardIdx >= 0, "both guards must exist");
	assert.ok(curlIdx > baseGuardIdx, "curl must come after the base URL guard");
	assert.ok(curlIdx > keyGuardIdx, "curl must come after the credential guard");
	assert.match(script, /\/api\/cron\/bump-view-counts/);
});

test("redirects are followed so a 308 cannot masquerade as success", async () => {
	const yaml = await read(BUMP_WF);
	const script = extractRunScript(yaml);

	// The legacy domain answers /api/* with 308; curl -f treats 3xx as success,
	// so an unfollowed redirect would report green while bumping nothing.
	assert.match(extractCurlCommand(script), /\s-L\b/, "curl must follow redirects");
	assert.ok(
		!/tradelovin\.com/.test(yaml),
		"must not default to the legacy 308 domain; require vars.TQ_CRON_BASE_URL",
	);
});

test("non-2xx responses fail the job", async () => {
	const script = extractRunScript(await read(BUMP_WF));

	assert.match(script, /http_code/, "must capture the HTTP status");
	const statusCase = matchBlock(script, /case "\$\{http_code\}" in\n([\s\S]*?)\nesac/, "status case");
	assert.match(statusCase, /2\*\)/, "2xx must be the only success branch");
	assert.match(statusCase, /\*\)\n?[\s\S]*exit 1/, "any other status must exit 1");
	assert.ok(
		!/2\*\)[^\n]*exit 1/.test(statusCase),
		"2xx must not exit 1",
	);
});

test("transport errors fail loudly instead of leaking curl's exit code", async () => {
	const script = extractRunScript(await read(BUMP_WF));

	assert.match(
		script,
		/if ! http_code="\$\(curl/,
		"curl failure must be guarded so an annotation is still printed",
	);
	assert.match(
		extractCurlCommand(script),
		/--retry \d/,
		"transient network errors must be retried",
	);
});

test("cron credentials are only passed as request headers and never logged", async () => {
	const yaml = await read(BUMP_WF);
	const script = extractRunScript(yaml);

	assert.match(script, /-H "\$\{auth_header\}: \$\{auth_value\}"/, "key must travel in a header");
	for (const name of ["VIEW_COUNT_CRON_KEY", "INTERNAL_WEBHOOK_TOKEN", "TQ_CRON_API_KEY"]) {
		assert.ok(
			!new RegExp(`echo\\s+"?[^\\n]*\\$\\{${name}\\}`).test(script),
			`must not echo the ${name} value`,
		);
		assert.ok(
			!new RegExp(`${name}\\s*[:=]\\s*["'][^"'$]+["']`).test(yaml),
			`${name} must not be hardcoded in the workflow`,
		);
	}
	assert.ok(!/echo[^\n]*\$\{auth_value\}/.test(script), "must not echo the resolved key");
});

test("schedule and manual triggers stay intact", async () => {
	const yaml = await read(BUMP_WF);

	assert.match(yaml, /workflow_dispatch:/, "manual re-run must stay available for catch-up");
	assert.match(yaml, /- cron: "10 0 \* \* \*"/, "daily 08:10 HKT schedule must stay");
	assert.match(yaml, /concurrency:\n\s+group: bump-view-counts/, "overlapping catch-up runs must be serialized");
	assert.ok(!yaml.includes("/api/tq/cron/recalculate"), "must not trigger TQ");
	assert.ok(
		!yaml.includes("/api/cron/video-marketing-growth"),
		"must not trigger marketing growth",
	);
});
