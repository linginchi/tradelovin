import { hasServiceRoleKey } from "@/lib/supabase/service";
import {
  getVideoStorageConfig,
  getVideoStorageMissingEnvNames,
  isLegacySupabaseVideoKey,
  isVideoStorageConfigured,
  objectStoreMissingFor,
  requiresObjectStore,
  SUPABASE_VIDEOS_BUCKET,
} from "@/lib/video/storage-config.mjs";

export {
  getVideoStorageConfig,
  getVideoStorageMissingEnvNames,
  isLegacySupabaseVideoKey,
  isVideoStorageConfigured,
  objectStoreMissingFor,
  requiresObjectStore,
  SUPABASE_VIDEOS_BUCKET,
};

const DEFAULT_SIGN_TTL_SECONDS = 15 * 60;

type VideoStorageConfig = NonNullable<ReturnType<typeof getVideoStorageConfig>>;

function normalizeEndpoint(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function encodeKeyPath(storageKey: string): string {
  return storageKey
    .split("/")
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join("/");
}

/**
 * True when the Worker can issue at least one kind of play URL.
 * Legacy Leo clips need the Supabase service role; `videos/` keys need R2/Aliyun.
 */
export function canServeVideoPlayback(): boolean {
  return hasServiceRoleKey() || isVideoStorageConfigured();
}

type AwsSdk = {
  S3Client: new (...args: any[]) => any;
  PutObjectCommand: new (...args: any[]) => unknown;
  GetObjectCommand: new (...args: any[]) => unknown;
  getSignedUrl: (...args: any[]) => Promise<string>;
};

async function loadAwsSdk(): Promise<AwsSdk> {
  const [{ S3Client, PutObjectCommand, GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);
  return { S3Client, PutObjectCommand, GetObjectCommand, getSignedUrl };
}

async function createS3Client(config: VideoStorageConfig) {
  const { S3Client } = await loadAwsSdk();
  return new S3Client({
    endpoint: normalizeEndpoint(config.endpoint),
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadVideoObject(
  storageKey: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getVideoStorageConfig();
  if (!config) {
    return { ok: false, error: "视频存储未配置，请联系管理员配置 VIDEO_STORAGE_* 环境变量" };
  }
  try {
    const { PutObjectCommand } = await loadAwsSdk();
    const client = await createS3Client(config);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
        Body: bytes,
        ContentType: contentType || "video/mp4",
      }),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "上传视频失败",
    };
  }
}

async function createSignedSupabaseVideosUrl(
  storageKey: string,
  ttlSeconds: number,
): Promise<string | null> {
  const { getServiceSupabase } = await import("@/lib/supabase/service");
  const srv = getServiceSupabase();
  if (!srv) return null;
  const { data, error } = await srv.storage
    .from(SUPABASE_VIDEOS_BUCKET)
    .createSignedUrl(storageKey, Math.max(1, ttlSeconds));
  if (error || !data?.signedUrl) {
    console.warn(
      "[video-storage] supabase Videos signed URL failed",
      error?.message ?? "empty signedUrl",
    );
    return null;
  }
  return data.signedUrl;
}

async function createSignedObjectStoreUrl(
  storageKey: string,
  ttlSeconds: number,
): Promise<string | null> {
  const config = getVideoStorageConfig();
  if (!config) return null;
  try {
    const { GetObjectCommand, getSignedUrl } = await loadAwsSdk();
    const client = await createS3Client(config);
    if (config.publicUrl) {
      const encodedKey = encodeKeyPath(storageKey);
      const baseUrl = `${config.publicUrl.replace(/\/+$/, "")}/${encodedKey}`;
      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }),
        { expiresIn: Math.max(1, ttlSeconds) },
      );
      const signed = new URL(signedUrl);
      const publicTarget = new URL(baseUrl);
      publicTarget.search = signed.search;
      return publicTarget.toString();
    }
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }),
      { expiresIn: Math.max(1, ttlSeconds) },
    );
  } catch {
    return null;
  }
}

/**
 * Issues a time-limited playback URL.
 * Legacy keys (not `videos/...`) are signed from Supabase Storage `Videos`
 * first — that is where Leo clips such as 豹哥·交易新銳 actually live.
 * Admin uploads under `videos/` use R2/Aliyun object storage.
 */
export async function createSignedVideoUrl(
  storageKey: string,
  ttlSeconds = DEFAULT_SIGN_TTL_SECONDS,
): Promise<string | null> {
  const key = storageKey.trim();
  if (!key) return null;

  if (isLegacySupabaseVideoKey(key)) {
    const supabaseUrl = await createSignedSupabaseVideosUrl(key, ttlSeconds);
    if (supabaseUrl) return supabaseUrl;
  }

  return createSignedObjectStoreUrl(key, ttlSeconds);
}
