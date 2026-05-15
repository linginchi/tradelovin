import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaidPlan } from "@/lib/billing/stripe";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import {
  UPGRADE_TQ_ENV,
  UPGRADE_TQ_PERIOD,
  evaluateUpgradeEligibility,
  getHighestEligiblePlanByScore,
  getRequiredScore,
  getNextPaidPlan,
  PLAN_PROGRESSION,
  type UpgradeEligibility,
} from "@/lib/membership/upgrade-rules";
import { TQ_MIN_TRADES_FOR_SCORE } from "@/lib/tq/constants";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { getServiceSupabase } from "@/lib/supabase/service";

type TqScoreRow = {
  total_score: number | null;
};

type TqFeatureRow = {
  raw_value: number | null;
};

type GraceState = "none" | "grace" | "downgrade";

type GraceCheckResult = {
  state: GraceState;
  expectedPlan: PaidPlan | null;
  graceStartAt: string | null;
  reason: string;
};

export type UpgradeGateContext = {
  membershipPlan: string;
  currentPaidPlan: PaidPlan | null;
  nextPlan: PaidPlan | null;
  freeByVideoSubscription: boolean;
  monthlyScore: number;
  monthlyTradeCount: number;
  minTradesForScore: number;
  highestEligiblePlanByScore: PaidPlan | null;
};

async function hasPaidVideoSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // Treat paid course enrollment as an active video subscription entitlement.
  const { data, error } = await supabase
    .from("course_registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[upgrade-gate] paid video subscription check failed", {
      userId,
      error: error.message,
    });
    return false;
  }

  return Boolean(data?.id);
}

export async function getMonthlyTqSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ totalScore: number; tradeCount: number; minTradesForScore: number; eligibleByTrades: boolean }> {
  const service = getServiceSupabase();
  const reader = service ?? supabase;
  if (service) {
    try {
      await ensureTqCalculated(service, { userId, environment: UPGRADE_TQ_ENV, period: UPGRADE_TQ_PERIOD });
    } catch (error) {
      console.warn("[upgrade-gate] ensureTqCalculated skipped", { userId, error });
    }
  }

  const [{ data: scoreRows, error: scoreErr }, { data: tradeRows, error: tradeErr }] = await Promise.all([
    reader
      .from("tq_scores")
      .select("total_score")
      .eq("user_id", userId)
      .eq("environment", UPGRADE_TQ_ENV)
      .eq("period", UPGRADE_TQ_PERIOD)
      .limit(1),
    reader
      .from("tq_features")
      .select("raw_value")
      .eq("user_id", userId)
      .eq("environment", UPGRADE_TQ_ENV)
      .eq("period", UPGRADE_TQ_PERIOD)
      .eq("feature_name", "TradeCount")
      .limit(1),
  ]);

  if (scoreErr || tradeErr) {
    console.warn("[upgrade-gate] read monthly TQ failed, fallback zero", {
      userId,
      scoreErr: scoreErr?.message,
      tradeErr: tradeErr?.message,
    });
    const minTradesForScore = TQ_MIN_TRADES_FOR_SCORE[UPGRADE_TQ_ENV];
    return {
      totalScore: 0,
      tradeCount: 0,
      minTradesForScore,
      eligibleByTrades: false,
    };
  }

  const scoreRow = (scoreRows?.[0] ?? null) as TqScoreRow | null;
  const tradeRow = (tradeRows?.[0] ?? null) as TqFeatureRow | null;
  const totalScore = Number(scoreRow?.total_score ?? 0);
  const tradeCount = Number(tradeRow?.raw_value ?? 0);
  const minTradesForScore = TQ_MIN_TRADES_FOR_SCORE[UPGRADE_TQ_ENV];

  return {
    totalScore: Number.isFinite(totalScore) ? totalScore : 0,
    tradeCount: Number.isFinite(tradeCount) ? tradeCount : 0,
    minTradesForScore,
    eligibleByTrades: tradeCount >= minTradesForScore,
  };
}

export async function checkUpgradeEligibility(
  supabase: SupabaseClient,
  userId: string,
  targetPlan: PaidPlan,
): Promise<{ eligibility: UpgradeEligibility; context: UpgradeGateContext }> {
  const membership = await ensureCurrentMembership(supabase, userId);
  if (!membership) {
    throw new Error("会员信息不存在");
  }

  const freeByVideoSubscription = await hasPaidVideoSubscription(supabase, userId);
  const tq = await getMonthlyTqSummary(supabase, userId);
  const eligibility = evaluateUpgradeEligibility({
    currentPlan: membership.plan,
    targetPlan,
    tq,
    freeByVideoSubscription,
  });

  return {
    eligibility,
    context: {
      membershipPlan: membership.plan,
      currentPaidPlan: eligibility.currentPaidPlan,
      nextPlan: eligibility.nextPlan,
      freeByVideoSubscription,
      monthlyScore: tq.totalScore,
      monthlyTradeCount: tq.tradeCount,
      minTradesForScore: tq.minTradesForScore,
      highestEligiblePlanByScore: getHighestEligiblePlanByScore(tq.totalScore),
    },
  };
}

export async function getUpgradePreview(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  membershipPlan: string;
  currentPaidPlan: PaidPlan | null;
  nextPlan: PaidPlan | null;
  monthlyScore: number;
  monthlyTradeCount: number;
  minTradesForScore: number;
  allowedPlans: PaidPlan[];
  planRequirements: Record<PaidPlan, { requiredScore: number; missingScore: number; unlocked: boolean }>;
}> {
  const membership = await ensureCurrentMembership(supabase, userId);
  if (!membership) {
    throw new Error("会员信息不存在");
  }

  const freeByVideoSubscription = await hasPaidVideoSubscription(supabase, userId);
  const tq = await getMonthlyTqSummary(supabase, userId);
  const planRequirements = {} as Record<
    PaidPlan,
    { requiredScore: number; missingScore: number; unlocked: boolean }
  >;
  for (const plan of PLAN_PROGRESSION) {
    const requiredScore = getRequiredScore(plan);
    planRequirements[plan] = {
      requiredScore,
      missingScore: Math.max(0, Math.ceil(requiredScore - tq.totalScore)),
      unlocked:
        ((membership.plan === "T0_trial" || membership.plan === "T0_paid") && plan === "T1") ||
        freeByVideoSubscription ||
        (tq.totalScore >= requiredScore && tq.eligibleByTrades),
    };
  }

  const allowedPlans: PaidPlan[] = [];
  const nextPlan = getNextPaidPlan(membership.plan);

  if (nextPlan) {
    const eligibility = evaluateUpgradeEligibility({
      currentPlan: membership.plan,
      targetPlan: nextPlan,
      tq,
      freeByVideoSubscription,
    });
    if (eligibility.allowed) {
      allowedPlans.push(nextPlan);
    }
  }

  return {
    membershipPlan: membership.plan,
    currentPaidPlan: membership.plan === "T1" || membership.plan === "T2" || membership.plan === "T3" ? membership.plan : null,
    nextPlan,
    freeByVideoSubscription,
    monthlyScore: tq.totalScore,
    monthlyTradeCount: tq.tradeCount,
    minTradesForScore: tq.minTradesForScore,
    allowedPlans,
    planRequirements,
  };
}

export async function evaluatePlanGraceState(
  supabase: SupabaseClient,
  userId: string,
): Promise<GraceCheckResult> {
  const membership = await ensureCurrentMembership(supabase, userId);
  if (!membership) {
    return { state: "none", expectedPlan: null, graceStartAt: null, reason: "membership_not_found" };
  }
  if (membership.plan !== "T1" && membership.plan !== "T2" && membership.plan !== "T3") {
    return { state: "none", expectedPlan: null, graceStartAt: null, reason: "not_paid_plan" };
  }

  const requiredScore = getRequiredScore(membership.plan);
  const tq = await getMonthlyTqSummary(supabase, userId);
  if (!tq.eligibleByTrades || tq.totalScore < requiredScore) {
    const graceStartedAt = membership.graceStartedAt;
    if (!graceStartedAt) {
      return { state: "grace", expectedPlan: getHighestEligiblePlanByScore(tq.totalScore), graceStartAt: null, reason: "below_threshold_first_time" };
    }
    return { state: "downgrade", expectedPlan: getHighestEligiblePlanByScore(tq.totalScore), graceStartAt: graceStartedAt, reason: "below_threshold_after_grace" };
  }

  return { state: "none", expectedPlan: membership.plan, graceStartAt: null, reason: "qualified" };
}
