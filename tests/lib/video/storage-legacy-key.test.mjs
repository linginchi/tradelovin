import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("legacy Leo keys are classified separately from R2 videos/ keys", async () => {
	const source = await read("src/lib/video/storage.ts");
	assert.match(source, /export function isLegacySupabaseVideoKey/);
	assert.match(source, /startsWith\("videos\/"\)/);
	assert.match(source, /export function objectStoreMissingFor/);
	assert.match(source, /requiresObjectStore\(storageKey\) && !isVideoStorageConfigured\(\)/);
});
