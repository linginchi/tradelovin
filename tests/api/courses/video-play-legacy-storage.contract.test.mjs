import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public play does not 503 all videos when VIDEO_STORAGE_* is missing", async () => {
	const source = await read("src/app/api/courses/[courseId]/videos/[videoId]/play/route.ts");
	assert.match(source, /objectStoreMissingFor/);
	assert.doesNotMatch(
		source,
		/if \(!isVideoStorageConfigured\(\)\)/,
		"must not gate every play request on R2/Aliyun being configured",
	);
	assert.match(source, /Leo\/AI clips/);
});

test("admin play uses the same per-key object-store gate", async () => {
	const source = await read("src/app/api/admin/courses/[courseId]/videos/[videoId]/play/route.ts");
	assert.match(source, /objectStoreMissingFor/);
	assert.doesNotMatch(source, /if \(!isVideoStorageConfigured\(\)\)/);
});
