import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("signed play URLs route legacy keys to Supabase Videos bucket", async () => {
	const source = await read("src/lib/video/storage.ts");
	assert.match(source, /SUPABASE_VIDEOS_BUCKET\s*=\s*"Videos"/);
	assert.match(source, /isLegacySupabaseVideoKey/);
	assert.match(source, /createSignedUrl/);
	assert.match(source, /startsWith\("videos\/"\)/);
	assert.match(
		source,
		/isLegacySupabaseVideoKey\(storageKey\)[\s\S]*createSignedSupabaseVideosUrl|createSignedSupabaseVideosUrl[\s\S]*isLegacySupabaseVideoKey/,
	);
});
