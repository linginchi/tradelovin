import { NextResponse } from "next/server";
import { z } from "zod";

import { type EarnReason, earnPoints } from "@/lib/points/service";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.enum([
    "daily_login",
    "sim_trade_completed",
    "referral_register",
    "referral_first_payment",
    "course_purchase",
  ]),
  referenceId: z.string().optional(),
  amount: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
    const result = await earnPoints(srv, {
      userId: auth.userId,
      reason: parsed.data.reason as EarnReason,
      referenceId: parsed.data.referenceId,
      amount: parsed.data.amount,
      metadata: parsed.data.metadata,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "积分发放失败" },
      { status: 500 },
    );
  }
}
