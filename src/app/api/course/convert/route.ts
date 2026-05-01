import { NextResponse } from "next/server";
import { z } from "zod";

import { earnPoints } from "@/lib/points/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  clickId: z.string().uuid(),
  amount: z.number().nonnegative(),
  commissionAmount: z.number().nonnegative().optional(),
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

  const { data: click } = await srv
    .from("course_clicks")
    .select("id,user_id,conversion_status")
    .eq("id", parsed.data.clickId)
    .maybeSingle();
  if (!click?.id || !click.user_id) {
    return NextResponse.json({ success: false, error: "点击记录不存在" }, { status: 404 });
  }
  if (click.conversion_status === "converted") {
    return NextResponse.json({ success: true, duplicate: true });
  }

  await srv
    .from("course_clicks")
    .update({
      conversion_status: "converted",
      commission_amount: parsed.data.commissionAmount ?? null,
      metadata: { purchaseAmount: parsed.data.amount },
    })
    .eq("id", parsed.data.clickId);

  await earnPoints(srv, {
    userId: String(click.user_id),
    reason: "course_purchase",
    amount: Math.floor(parsed.data.amount),
    referenceId: parsed.data.clickId,
  });

  return NextResponse.json({ success: true });
}
