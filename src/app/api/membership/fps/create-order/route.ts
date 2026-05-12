import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getAmountByPlan, getManualPaymentBankInfo } from "@/lib/membership/plans";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["T1", "T2", "T3"]),
  period: z.enum(["monthly", "yearly"]),
});

function generateOrderNo(): string {
  return `FPS-${Date.now()}-${randomInt(1000, 9999)}`;
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const orderNo = generateOrderNo();
  const amount = getAmountByPlan(parsed.data.plan, parsed.data.period);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await auth.supabase.from("manual_payment_orders").insert({
    user_id: auth.userId,
    order_no: orderNo,
    plan: parsed.data.plan,
    period: parsed.data.period,
    amount,
    status: "pending",
    expires_at: expiresAt,
  });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orderNo,
    amount,
    expiresAt,
    bankInfo: getManualPaymentBankInfo(),
  });
}
