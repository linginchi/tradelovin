import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("signed play URLs route legacy keys to Supabase Videos bucket", async () => {
	const config = await read("src/lib/video/storage-config.mjs");
	const source = await read("src/lib/video/storage.ts");
	assert.match(config, /SUPABASE_VIDEOS_BUCKET\s*=\s*"Videos"/);
	assert.match(config, /isLegacySupabaseVideoKey/);
	assert.match(config, /startsWith\("videos\/"\)/);
	assert.match(source, /createSignedUrl/);
	assert.match(
		source,
		/isLegacySupabaseVideoKey\(key\)[\s\S]*createSignedSupabaseVideosUrl|createSignedSupabaseVideosUrl[\s\S]*isLegacySupabaseVideoKey/,
	);
});
