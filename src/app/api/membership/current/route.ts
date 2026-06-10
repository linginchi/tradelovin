import { NextResponse } from "next/server";

import {
	buildSuperUserCurrentMembership,
	isSuperUserById,
} from "@/lib/auth/super-user";
import { reconcileMembershipFromStripe } from "@/lib/membership/reconcile-from-stripe";
import { getUpgradePreview } from "@/lib/membership/upgrade-gate";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (srv && (await isSuperUserById(srv, auth.userId))) {
    const membership = buildSuperUserCurrentMembership(auth.userId);
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
        stripeSubscriptionId: membership.stripeSubscriptionId,
        stripeCustomerId: membership.stripeCustomerId,
        billingCycle: membership.billingCycle,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        trialDaysLeft: 0,
        upgradePreview: null,
      },
    });
  }

  let membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (membership && (membership.plan === "T0_trial" || membership.plan === "T0_paid")) {
    try {
      const reconciled = await reconcileMembershipFromStripe(auth.supabase, auth.userId);
      if (reconciled) {
        membership = await ensureCurrentMembership(auth.supabase, auth.userId);
      }
    } catch (error) {
      console.warn("[membership/current] reconcile from stripe failed", {
        userId: auth.userId,
        error,
      });
    }
  }
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

  let upgradePreview: Awaited<ReturnType<typeof getUpgradePreview>> | null = null;
  try {
    upgradePreview = await getUpgradePreview(auth.supabase, auth.userId);
  } catch (error) {
    console.warn("[membership/current] upgrade preview unavailable", {
      userId: auth.userId,
      error,
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
      stripeSubscriptionId: membership.stripeSubscriptionId,
      stripeCustomerId: membership.stripeCustomerId,
      billingCycle: membership.billingCycle,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      trialDaysLeft,
      upgradePreview,
    },
  });
}
