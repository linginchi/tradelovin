import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

test("opennext workflow runs xeoaxis contract tests and post-deploy smoke", async () => {
	const source = await readFile(new URL(".github/workflows/opennext-build.yml", root), "utf8");
	assert.match(source, /test:contracts:xeoaxis/);
	assert.match(source, /smoke:xeoaxis/);
	assert.match(source, /XEOAXIS_RECOVERY\.md/);
});
