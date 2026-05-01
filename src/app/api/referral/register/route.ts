import { NextResponse } from "next/server";
import { z } from "zod";

import { attachRefereeByCode } from "@/lib/referral/service";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  ref: z.string().min(4),
});

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

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

  await attachRefereeByCode(srv, {
    code: parsed.data.ref,
    refereeId: auth.userId,
  });
  return NextResponse.json({ success: true });
}
