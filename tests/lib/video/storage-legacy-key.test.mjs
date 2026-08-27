import assert from "node:assert/strict";
import test from "node:test";

import {
	getVideoStorageMissingEnvNames,
	isLegacySupabaseVideoKey,
	isVideoStorageConfigured,
	objectStoreMissingFor,
	requiresObjectStore,
} from "../../../src/lib/video/storage-config.mjs";

function withEnv(overrides, fn) {
	const keys = Object.keys(overrides);
	const previous = {};
	for (const key of keys) {
		previous[key] = process.env[key];
		if (overrides[key] == null) delete process.env[key];
		else process.env[key] = overrides[key];
	}
	try {
		return fn();
	} finally {
		for (const key of keys) {
			if (previous[key] == null) delete process.env[key];
			else process.env[key] = previous[key];
		}
	}
}

const EMPTY_STORAGE = {
	VIDEO_STORAGE_PROVIDER: "",
	VIDEO_STORAGE_BUCKET: "",
	VIDEO_STORAGE_ENDPOINT: "",
	VIDEO_STORAGE_ACCESS_KEY_ID: "",
	VIDEO_STORAGE_SECRET_ACCESS_KEY: "",
};

const R2_STORAGE = {
	VIDEO_STORAGE_PROVIDER: "r2",
	VIDEO_STORAGE_BUCKET: "videos",
	VIDEO_STORAGE_ENDPOINT: "https://example.r2.cloudflarestorage.com",
	VIDEO_STORAGE_ACCESS_KEY_ID: "id",
	VIDEO_STORAGE_SECRET_ACCESS_KEY: "secret",
};

test("legacy Leo keys are not treated as object-store uploads", () => {
	assert.equal(isLegacySupabaseVideoKey("leo-004/nick-leeson.mp4"), true);
	assert.equal(isLegacySupabaseVideoKey("ai/weekly-2026-08.mp4"), true);
	assert.equal(isLegacySupabaseVideoKey("videos/9ea59ef3/clip.mp4"), false);
	assert.equal(isLegacySupabaseVideoKey(""), false);
	assert.equal(requiresObjectStore("leo-004/nick-leeson.mp4"), false);
	assert.equal(requiresObjectStore("videos/9ea59ef3/clip.mp4"), true);
});

test("missing VIDEO_STORAGE_* does not block legacy keys and does block videos/ keys", () => {
	withEnv(EMPTY_STORAGE, () => {
		assert.equal(isVideoStorageConfigured(), false);
		assert.equal(objectStoreMissingFor("leo-004/nick-leeson.mp4"), false);
		assert.equal(objectStoreMissingFor("videos/9ea59ef3/clip.mp4"), true);
		assert.deepEqual(getVideoStorageMissingEnvNames(), [
			"VIDEO_STORAGE_PROVIDER",
			"VIDEO_STORAGE_BUCKET",
			"VIDEO_STORAGE_ENDPOINT",
			"VIDEO_STORAGE_ACCESS_KEY_ID",
			"VIDEO_STORAGE_SECRET_ACCESS_KEY",
		]);
	});
});

test("configured object store unblocks videos/ keys", () => {
	withEnv(R2_STORAGE, () => {
		assert.equal(isVideoStorageConfigured(), true);
		assert.equal(objectStoreMissingFor("videos/9ea59ef3/clip.mp4"), false);
		assert.equal(objectStoreMissingFor("leo-004/nick-leeson.mp4"), false);
		assert.deepEqual(getVideoStorageMissingEnvNames(), []);
	});
});
