import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const PLAY_ROUTE = "src/app/api/courses/[courseId]/videos/[videoId]/play/route.ts";
const ADMIN_PLAY = "src/app/api/admin/courses/[courseId]/videos/[videoId]/play/route.ts";
const STORAGE = "src/lib/video/storage-config.mjs";
const STORAGE_TS = "src/lib/video/storage.ts";

function getHandler(source) {
	const getStart = source.indexOf("export async function GET");
	const postStart = source.indexOf("export async function POST");
	assert.ok(getStart > -1, "expected a GET handler");
	return postStart > getStart ? source.slice(getStart, postStart) : source.slice(getStart);
}

test("public play does not require object storage before the video key is known", async () => {
	const source = await read(PLAY_ROUTE);
	const getBody = getHandler(source);

	const loadAt = getBody.indexOf("await loadVideo(");
	const objectStoreAt = getBody.indexOf("objectStoreMissingFor(");
	assert.ok(loadAt > -1, "GET must load the video row");
	assert.ok(objectStoreAt > -1, "GET must consult objectStoreMissingFor");
	assert.ok(
		loadAt < objectStoreAt,
		"must read storage_key before deciding the video service is unconfigured",
	);

	assert.ok(
		!/if\s*\(\s*!isVideoStorageConfigured\(\)\s*\)/.test(getBody),
		"must not blanket-503 when VIDEO_STORAGE_* is missing",
	);
	assert.match(getBody, /视频服务暂未配置/);
});

test("admin play uses the same per-key object-store gate", async () => {
	const source = await read(ADMIN_PLAY);
	assert.match(source, /objectStoreMissingFor\(/);
	assert.ok(
		!/if\s*\(\s*!isVideoStorageConfigured\(\)\s*\)/.test(source),
		"admin play must not blanket-503 when VIDEO_STORAGE_* is missing",
	);

	const signCalls = [...source.matchAll(/createSignedVideoUrl\(/g)];
	assert.ok(signCalls.length >= 1, "admin play must sign a URL");
	for (const match of signCalls) {
		const before = source.slice(Math.max(0, match.index - 400), match.index);
		assert.match(
			before,
			/rejectIfObjectStoreRequired\(/,
			"every sign must run after the per-key object-store gate",
		);
	}
});

test("object-store gate is false for legacy keys and true for videos/ keys when R2 is off", async () => {
	const source = await read(STORAGE);
	assert.match(source, /export function requiresObjectStore/);
	assert.match(source, /export function objectStoreMissingFor/);
	assert.match(
		source,
		/objectStoreMissingFor[\s\S]*requiresObjectStore\(storageKey\) && !isVideoStorageConfigured\(\)/,
	);
	const ts = await read(STORAGE_TS);
	assert.match(ts, /export function canServeVideoPlayback/);
	assert.match(ts, /hasServiceRoleKey\(\) \|\| isVideoStorageConfigured\(\)/);
});
