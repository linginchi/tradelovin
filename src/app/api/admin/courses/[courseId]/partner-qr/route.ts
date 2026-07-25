import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { uploadVideoObject } from "@/lib/video/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

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

  const form = await request.formData();
  const file = form.get("qr_image");
  const label = String(form.get("label") ?? "合作夥伴").trim();

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "请上传二维码图片" }, { status: 400 });
  }

  const contentType = file.type || "image/png";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片格式" }, { status: 400 });
  }

  const storageKey = `partner-qr/${courseId}-${Date.now()}-${randomUUID()}.png`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = await uploadVideoObject(storageKey, bytes, contentType);
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 500 });
  }

  // Build public URL (R2 public bucket)
  const publicUrl = process.env.VIDEO_STORAGE_PUBLIC_URL ?? "";
  const qrUrl = publicUrl
    ? `${publicUrl.replace(/\/+$/, "")}/${storageKey}`
    : `/api/video/raw?key=${encodeURIComponent(storageKey)}`;

  const { error } = await srv
    .from("courses")
    .update({ partner_qr_url: qrUrl, partner_qr_label: label || "合作夥伴" })
    .eq("id", courseId);

  if (error) {
    // 列可能不存在 → 提示管理员执行迁移
    if (error.message.toLowerCase().includes("partner_qr")) {
      return NextResponse.json(
        {
          error: "数据库缺少 partner_qr_url / partner_qr_label 列，请在 Supabase SQL Editor 中执行对应迁移 SQL",
          hint: "supabase/migrations/20260617000000_video_views_and_partner_qr.sql",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ partnerQrUrl: qrUrl });
}

/** 直接设置 QR URL（无需重新上传图片） */
export async function PUT(request: Request, { params }: RouteContext) {
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

  let body: { partner_qr_url?: string; partner_qr_label?: string };
  try {
    body = (await request.json()) as { partner_qr_url?: string; partner_qr_label?: string };
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.partner_qr_url !== undefined) updates.partner_qr_url = body.partner_qr_url;
  if (body.partner_qr_label !== undefined) updates.partner_qr_label = body.partner_qr_label;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "请提供 partner_qr_url 或 partner_qr_label" }, { status: 400 });
  }

  const { error } = await srv
    .from("courses")
    .update(updates)
    .eq("id", courseId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
