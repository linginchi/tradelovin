type VideoStorageConfig = {
  provider: "r2" | "aliyun";
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
};

const DEFAULT_SIGN_TTL_SECONDS = 15 * 60;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

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

function isValidProvider(value: string): value is "r2" | "aliyun" {
  return value === "r2" || value === "aliyun";
}

export function getVideoStorageConfig(): VideoStorageConfig | null {
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

export function isVideoStorageConfigured(): boolean {
  return Boolean(getVideoStorageConfig());
}

export function getVideoStorageMissingEnvNames(): string[] {
  const missing: string[] = [];
  if (!env("VIDEO_STORAGE_PROVIDER")) missing.push("VIDEO_STORAGE_PROVIDER");
  if (!env("VIDEO_STORAGE_BUCKET")) missing.push("VIDEO_STORAGE_BUCKET");
  if (!env("VIDEO_STORAGE_ENDPOINT")) missing.push("VIDEO_STORAGE_ENDPOINT");
  if (!env("VIDEO_STORAGE_ACCESS_KEY_ID")) missing.push("VIDEO_STORAGE_ACCESS_KEY_ID");
  if (!env("VIDEO_STORAGE_SECRET_ACCESS_KEY")) missing.push("VIDEO_STORAGE_SECRET_ACCESS_KEY");
  return missing;
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

export async function createSignedVideoUrl(
  storageKey: string,
  ttlSeconds = DEFAULT_SIGN_TTL_SECONDS,
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
