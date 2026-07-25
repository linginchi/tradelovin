import { NextRequest, NextResponse } from "next/server";

import { getVideoStorageConfig } from "@/lib/video/storage";

export const runtime = "nodejs";

async function loadAwsSdk() {
  const [{ S3Client, GetObjectCommand }] = await Promise.all([import("@aws-sdk/client-s3")]);
  return { S3Client, GetObjectCommand };
}

function normalizeEndpoint(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  // Prevent directory traversal
  if (key.includes("..") || key.startsWith("/")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const config = getVideoStorageConfig();
  if (!config) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  try {
    const { S3Client, GetObjectCommand } = await loadAwsSdk();
    const client = new S3Client({
      endpoint: normalizeEndpoint(config.endpoint),
      region: "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 });
    }

    const contentType = response.ContentType ?? "application/octet-stream";
    const cacheControl = "public, max-age=31536000, immutable";

    // Stream the body
    const bytes = await response.Body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read object";
    if (message.includes("NoSuchKey") || message.includes("NotFound") || message.includes("404")) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
