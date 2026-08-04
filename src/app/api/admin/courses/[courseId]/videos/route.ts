import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";
import { getVideoStorageMissingEnvNames, isVideoStorageConfigured, uploadVideoObject } from "@/lib/video/storage";

export const runtime = "nodejs";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "application/octet-stream"]);
const MAX_VIDEO_BYTES = 1024 * 1024 * 800; // 800MB

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const fieldSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  duration: z.number().int().nonnegative().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  is_free_preview: z.boolean().optional(),
});

function safeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
  return cleaned.slice(0, 120) || "video.mp4";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const { courseId } = await params;
  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const fullColumns =
    "id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, view_count, marketing_view_count";
  const baseColumns =
    "id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at";

  const primary = await srv
    .from("course_videos")
    .select(fullColumns)
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  let rows: unknown[] | null = primary.data;
  let error = primary.error;

  if (error && /view_count|marketing_view_count/i.test(error.message)) {
    const fallback = await srv
      .from("course_videos")
      .select(baseColumns)
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    rows = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingRelationError(error, "course_videos")) {
      return NextResponse.json(
        { error: "视频表尚未创建，请先执行数据库迁移（course_videos / user_video_progress）" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    videos: rows ?? [],
    storageConfigured: isVideoStorageConfigured(),
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const { courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) {
    return NextResponse.json({ error: "课程 ID 无效" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: course } = await srv.from("courses").select("id").eq("id", courseId).maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }

  if (!isVideoStorageConfigured()) {
    const missing = getVideoStorageMissingEnvNames();
    return NextResponse.json(
      {
        error: `视频存储未配置，请先设置：${missing.join(", ") || "VIDEO_STORAGE_* 环境变量"}`,
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传视频文件（字段名 video）" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "视频文件为空" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "视频过大，请控制在 800MB 内" }, { status: 400 });
  }
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    return NextResponse.json({ error: "仅支持 MP4 视频上传" }, { status: 400 });
  }

  const parsed = fieldSchema.safeParse({
    title: String(form.get("title") ?? "").trim() || file.name,
    description: String(form.get("description") ?? "").trim() || undefined,
    duration: form.get("duration") ? Number(form.get("duration")) : undefined,
    sort_order: form.get("sort_order") ? Number(form.get("sort_order")) : undefined,
    is_free_preview:
      String(form.get("is_free_preview") ?? "").toLowerCase() === "true" ||
      String(form.get("is_free_preview") ?? "") === "1",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "视频参数无效" }, { status: 400 });
  }

  const storageKey = `videos/${courseId}/${Date.now()}-${randomUUID()}-${safeName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = await uploadVideoObject(storageKey, bytes, file.type || "video/mp4");
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const insertRow = {
    course_id: courseId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    duration: parsed.data.duration ?? null,
    sort_order: parsed.data.sort_order ?? 0,
    storage_key: storageKey,
    is_free_preview: parsed.data.is_free_preview ?? false,
    // Admin uploads are live by default (pipeline drafts use published_at=null).
    published_at: nowIso,
  };

  let { data, error } = await srv
    .from("course_videos")
    .insert(insertRow)
    .select(
      "id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, view_count, marketing_view_count, published_at",
    )
    .maybeSingle();

  if (error && /published_at/i.test(error.message)) {
    const { published_at: _drop, ...legacyRow } = insertRow;
    const legacy = await srv
      .from("course_videos")
      .insert(legacyRow)
      .select(
        "id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, view_count, marketing_view_count",
      )
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) {
    if (isMissingRelationError(error, "course_videos")) {
      return NextResponse.json(
        { error: "视频表尚未创建，请先执行数据库迁移（course_videos / user_video_progress）" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ video: data });
}
