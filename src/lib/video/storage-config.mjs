/**
 * Video storage key classification and VIDEO_STORAGE_* presence.
 * Kept as plain ESM so contract tests can import it without TS path aliases.
 */

export const SUPABASE_VIDEOS_BUCKET = "Videos";

function env(name) {
	return (process.env[name] ?? "").trim();
}

function isValidProvider(value) {
	return value === "r2" || value === "aliyun";
}

/** True for storage_key values that are not the admin R2 upload prefix. */
export function isLegacySupabaseVideoKey(storageKey) {
	const key = String(storageKey ?? "").trim();
	if (!key) return false;
	return !key.startsWith("videos/");
}

/** Admin uploads under `videos/` need R2/Aliyun; Leo/AI clips do not. */
export function requiresObjectStore(storageKey) {
	return !isLegacySupabaseVideoKey(storageKey);
}

export function getVideoStorageConfig() {
	const providerRaw = env("VIDEO_STORAGE_PROVIDER").toLowerCase();
	if (!isValidProvider(providerRaw)) return null;
	const bucket = env("VIDEO_STORAGE_BUCKET");
	const endpoint = env("VIDEO_STORAGE_ENDPOINT");
	const accessKeyId = env("VIDEO_STORAGE_ACCESS_KEY_ID");
	const secretAccessKey = env("VIDEO_STORAGE_SECRET_ACCESS_KEY");
	const publicUrl = env("VIDEO_STORAGE_PUBLIC_URL");
	if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
	return {
		provider: providerRaw,
		bucket,
		endpoint,
		accessKeyId,
		secretAccessKey,
		publicUrl: publicUrl || undefined,
	};
}

export function isVideoStorageConfigured() {
	return Boolean(getVideoStorageConfig());
}

export function getVideoStorageMissingEnvNames() {
	const missing = [];
	if (!env("VIDEO_STORAGE_PROVIDER")) missing.push("VIDEO_STORAGE_PROVIDER");
	if (!env("VIDEO_STORAGE_BUCKET")) missing.push("VIDEO_STORAGE_BUCKET");
	if (!env("VIDEO_STORAGE_ENDPOINT")) missing.push("VIDEO_STORAGE_ENDPOINT");
	if (!env("VIDEO_STORAGE_ACCESS_KEY_ID")) missing.push("VIDEO_STORAGE_ACCESS_KEY_ID");
	if (!env("VIDEO_STORAGE_SECRET_ACCESS_KEY")) missing.push("VIDEO_STORAGE_SECRET_ACCESS_KEY");
	return missing;
}

/**
 * True when this key cannot be signed with the currently configured backends.
 * Legacy keys only need the Supabase service role (checked later by the signer).
 */
export function objectStoreMissingFor(storageKey) {
	return requiresObjectStore(storageKey) && !isVideoStorageConfigured();
}
