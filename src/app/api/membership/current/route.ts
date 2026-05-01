import { NextResponse } from "next/server";

import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (!membership) {
    const legacy = await getMembershipSnapshot(auth.supabase, auth.userId);
    if (!legacy) {
      return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
    }
    const legacyPlan = legacy.tier === "T3" ? "T3" : legacy.tier === "T2" ? "T2" : "T0_trial";
    const trialDaysLeft = Math.max(
      0,
      Math.ceil((new Date(legacy.trialEndAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    return NextResponse.json({
      success: true,
      data: {
        id: `legacy-${legacy.userId}`,
        userId: legacy.userId,
        plan: legacyPlan,
        status: legacy.status,
        trialEnd: legacy.trialEndAt,
        currentPeriodStart: legacy.currentPeriodStart ?? legacy.trialStartAt,
        currentPeriodEnd: legacy.currentPeriodEnd ?? legacy.trialEndAt,
        cancelAtPeriodEnd: false,
        billingCycle: null,
        createdAt: legacy.trialStartAt,
        updatedAt: legacy.trialStartAt,
        trialDaysLeft,
      },
    });
  }

  const trialDaysLeft = membership.trialEnd
    ? Math.max(0, Math.ceil((new Date(membership.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      id: membership.id,
      userId: membership.userId,
      plan: membership.plan,
      status: membership.status,
      trialEnd: membership.trialEnd,
      currentPeriodStart: membership.currentPeriodStart,
      currentPeriodEnd: membership.currentPeriodEnd,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      billingCycle: membership.billingCycle,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      trialDaysLeft,
    },
  });
}
