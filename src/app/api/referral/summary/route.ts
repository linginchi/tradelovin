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

  const generated = await generateReferralCode(srv, auth.userId);
  const [{ data: referrals }, { data: rewards }] = await Promise.all([
    srv
      .from("referrals")
      .select("id,code,status,reward_granted,created_at,completed_at,referee_id")
      .eq("referrer_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    srv
      .from("points_transactions")
      .select("id,amount,reason,reference_id,created_at")
      .eq("user_id", auth.userId)
      .in("reason", ["referral_register", "referral_first_payment"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  return NextResponse.json({
    success: true,
    data: {
      code: generated.code,
      inviteLink: `${origin.replace(/\/$/, "")}/register?ref=${generated.code}`,
      referrals: referrals ?? [],
      rewards: rewards ?? [],
    },
  });
}
