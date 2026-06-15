import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const KNOWN_PLATFORMS: Record<string, RegExp> = {
  xiaohongshu: /xiaohongshu\.com/,
  douyin: /douyin\.com/,
  weibo: /weibo\.com/,
  bilibili: /bilibili\.com/,
  youtube: /youtube\.com/,
  instagram: /instagram\.com/,
  twitter: /twitter\.com|x\.com/,
  other: /.+/,  // any URL passes as "other"
};

const bodySchema = z.object({
  socialUrl: z.string().min(1).max(500),
  platform: z.enum(["xiaohongshu", "douyin", "weibo", "bilibili", "youtube", "instagram", "twitter", "other"]),
  channelName: z.string().min(1).max(100).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 检查是否已经是 partner
  const { data: existing } = await srv
    .from("channel_partners")
    .select("id,status")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "pending_review") {
      return NextResponse.json({ success: false, error: "您的申请正在审核中，请耐心等待" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "您已经是渠道合作伙伴" }, { status: 409 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数错误: " + parsed.error.message },
      { status: 400 },
    );
  }

  // 校验 URL 格式
  const urlPattern = KNOWN_PLATFORMS[parsed.data.platform];
  if (!urlPattern.test(parsed.data.socialUrl)) {
    return NextResponse.json({
      success: false,
      error: `链接格式不匹配，请提供有效的${parsed.data.platform !== "other" ? parsed.data.platform : ""}链接`,
    }, { status: 400 });
  }

  const channelName = parsed.data.channelName ?? "KOL";

  const { error } = await srv
    .from("channel_partners")
    .insert({
      user_id: auth.userId,
      channel_type: "kol",
      channel_name: channelName,
      platform: parsed.data.platform,
      commission_rate: 0.2,
      contact_email: parsed.data.contactEmail ?? null,
      status: "pending_review",
      payout_info: { social_url: parsed.data.socialUrl },
    });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "申请已提交，请等待审核" }, { status: 201 });
}
