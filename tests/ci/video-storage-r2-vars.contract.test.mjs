import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("wrangler vars keep R2 lesson playback configured across deploys", async () => {
	const wrangler = await read("wrangler.jsonc");
	assert.match(wrangler, /"VIDEO_STORAGE_PROVIDER":\s*"r2"/);
	assert.match(wrangler, /"VIDEO_STORAGE_BUCKET":\s*"jianbao-videos"/);
	assert.match(
		wrangler,
		/"VIDEO_STORAGE_ENDPOINT":\s*"https:\/\/3776aaf92edc5404ea26d4f815ac0c32\.r2\.cloudflarestorage\.com"/,
	);
	assert.doesNotMatch(
		wrangler,
		/"VIDEO_STORAGE_ACCESS_KEY_ID"|"VIDEO_STORAGE_SECRET_ACCESS_KEY"/,
		"R2 keys must stay Worker secrets, not wrangler vars",
	);
});

test("CI deploy must not omit VIDEO_STORAGE vars from wrangler.jsonc", async () => {
	const workflow = await read(".github/workflows/opennext-build.yml");
	assert.match(workflow, /npx wrangler deploy --config wrangler.jsonc/);
});
