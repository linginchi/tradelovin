import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const updateSchema = z.object({
  channelName: z.string().min(1).max(100).optional(),
  channelId: z.string().optional(),
  platform: z.string().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")).optional(),
  status: z.enum(["active", "paused", "terminated"]).optional(),
  payoutInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  const { data: partner, error } = await srv
    .from("channel_partners")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !partner) {
    return NextResponse.json({ success: false, error: "KOL 不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { partner } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.channelName !== undefined) updates.channel_name = parsed.data.channelName;
  if (parsed.data.channelId !== undefined) updates.channel_id = parsed.data.channelId;
  if (parsed.data.platform !== undefined) updates.platform = parsed.data.platform;
  if (parsed.data.commissionRate !== undefined) updates.commission_rate = parsed.data.commissionRate;
  if (parsed.data.contactEmail !== undefined) updates.contact_email = parsed.data.contactEmail;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.payoutInfo !== undefined) updates.payout_info = parsed.data.payoutInfo;
  updates.updated_at = new Date().toISOString();

  const { error } = await srv.from("channel_partners").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
