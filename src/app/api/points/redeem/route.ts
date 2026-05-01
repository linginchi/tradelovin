import { NextResponse } from "next/server";
import { z } from "zod";

import { type RedeemRewardType, redeemPoints } from "@/lib/points/service";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  rewardType: z.enum(["membership_discount", "course_voucher", "t2_report_single_download"]),
});

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  try {
    const result = await redeemPoints(srv, {
      userId: auth.userId,
      rewardType: parsed.data.rewardType as RedeemRewardType,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "兑换失败" },
      { status: 400 },
    );
  }
}
