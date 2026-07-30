import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

test("opennext workflow runs xeoaxis contract tests and post-deploy smoke", async () => {
	const source = await readFile(new URL(".github/workflows/opennext-build.yml", root), "utf8");
	assert.match(source, /test:contracts:xeoaxis/);
	assert.match(source, /smoke:xeoaxis/);
	assert.match(source, /XEOAXIS_RECOVERY\.md/);
	assert.match(source, /NEXT_PUBLIC_APP_URL/);
});

test("deployment documentation keeps legacy overseas redirect disabled by default", async () => {
	const source = await readFile(new URL("DEPLOY.md", root), "utf8");
	assert.match(source, /ENABLE_LEGACY_OVERSEAS_REDIRECT/);
	assert.match(source, /默认关闭/);
	assert.match(source, /Stripe/);
	assert.match(source, /Supabase/);
	assert.match(source, /NEXT_PUBLIC_APP_URL/);
	assert.match(source, /TQ_CRON_BASE_URL/);
});
