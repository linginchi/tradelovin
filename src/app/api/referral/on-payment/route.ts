import { NextResponse } from "next/server";
import { z } from "zod";

import { createCommissionRecord } from "@/lib/commission/service";
import { settleReferralOnFirstPayment } from "@/lib/referral/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  refereeId: z.string().uuid(),
  paymentId: z.string().optional(),
  amount: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_WEBHOOK_TOKEN;
  const token = request.headers.get("x-internal-token");
  if (secret && token !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

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

  await settleReferralOnFirstPayment(srv, {
    refereeId: parsed.data.refereeId,
    paymentId: parsed.data.paymentId,
  });

  // 创建分佣记录（如果该学员由 KOL 引入）
  if (parsed.data.amount && parsed.data.amount > 0) {
    await createCommissionRecord(srv, {
      refereeId: parsed.data.refereeId,
      paymentTransactionId: parsed.data.paymentId ?? "",
      tuitionAmount: parsed.data.amount,
    });
  }

  return NextResponse.json({ success: true });
}
