import { NextResponse } from "next/server";

import { generateReferralCode } from "@/lib/referral/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  try {
    const generated = await generateReferralCode(srv, auth.userId);
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    return NextResponse.json({
      success: true,
      data: {
        code: generated.code,
        referralId: generated.referralId,
        inviteLink: `${origin.replace(/\/$/, "")}/register?ref=${generated.code}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "邀请码生成失败",
      },
      { status: 500 },
    );
  }
}
