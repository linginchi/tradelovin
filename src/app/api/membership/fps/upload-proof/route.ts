import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  orderNo: z.string().min(8),
  proofImageUrl: z.string().url(),
});

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

  const { data: order, error: queryError } = await auth.supabase
    .from("manual_payment_orders")
    .select("id,status,expires_at")
    .eq("user_id", auth.userId)
    .eq("order_no", parsed.data.orderNo)
    .maybeSingle();
  if (queryError || !order) {
    return NextResponse.json({ success: false, error: "订单不存在" }, { status: 404 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ success: false, error: "订单状态不可上传凭证" }, { status: 400 });
  }
  const expiresMs = order.expires_at ? new Date(order.expires_at).getTime() : 0;
  if (!expiresMs || expiresMs < Date.now()) {
    return NextResponse.json({ success: false, error: "订单已过期" }, { status: 400 });
  }

  const { error: updateError } = await auth.supabase
    .from("manual_payment_orders")
    .update({
      proof_image_url: parsed.data.proofImageUrl,
      status: "pending_approval",
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
