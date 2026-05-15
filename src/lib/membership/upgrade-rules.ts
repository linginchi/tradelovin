import type { PaidPlan } from "@/lib/billing/stripe";
import type { UserPlan } from "@/lib/membership/v2";

export const UPGRADE_TQ_ENV = "sim" as const;
export const UPGRADE_TQ_PERIOD = "monthly" as const;

export const UPGRADE_SCORE_THRESHOLDS: Record<PaidPlan, number> = {
  T1: 60,
  T2: 75,
  T3: 90,
};

export const PLAN_PROGRESSION = ["T1", "T2", "T3"] as const;

export type UpgradeCheckCode =
  | "ok"
  | "already_top"
  | "invalid_target"
  | "must_upgrade_step_by_step"
  | "not_enough_trades"
  | "score_not_enough";

export type TqMonthlySummary = {
  totalScore: number;
  tradeCount: number;
  minTradesForScore: number;
  eligibleByTrades: boolean;
};

export type UpgradeEligibility = {
  allowed: boolean;
  code: UpgradeCheckCode;
  message: string;
  freeByVideoSubscription?: boolean;
  currentPaidPlan: PaidPlan | null;
  nextPlan: PaidPlan | null;
  targetPlan: PaidPlan;
  requiredScore: number;
  missingScore: number;
  tq: TqMonthlySummary;
};

export function asPaidPlan(plan: UserPlan): PaidPlan | null {
  if (plan === "T1" || plan === "T2" || plan === "T3") return plan;
  return null;
}

export function getNextPaidPlan(plan: UserPlan): PaidPlan | null {
  if (plan === "T0_trial" || plan === "T0_paid") return "T1";
  if (plan === "T1") return "T2";
  if (plan === "T2") return "T3";
  return null;
}

export function getRequiredScore(plan: PaidPlan): number {
  return UPGRADE_SCORE_THRESHOLDS[plan];
}

export function getHighestEligiblePlanByScore(totalScore: number): PaidPlan | null {
  if (totalScore >= UPGRADE_SCORE_THRESHOLDS.T3) return "T3";
  if (totalScore >= UPGRADE_SCORE_THRESHOLDS.T2) return "T2";
  if (totalScore >= UPGRADE_SCORE_THRESHOLDS.T1) return "T1";
  return null;
}

export function evaluateUpgradeEligibility(input: {
  currentPlan: UserPlan;
  targetPlan: PaidPlan;
  tq: TqMonthlySummary;
  freeByVideoSubscription?: boolean;
}): UpgradeEligibility {
  const currentPaidPlan = asPaidPlan(input.currentPlan);
  const nextPlan = getNextPaidPlan(input.currentPlan);
  const requiredScore = getRequiredScore(input.targetPlan);
  const missingScore = Math.max(0, Math.ceil(requiredScore - input.tq.totalScore));

  if (!nextPlan) {
    return {
      allowed: false,
      code: "already_top",
      message: "当前已是最高等级，无需继续升级。",
      currentPaidPlan,
      nextPlan: null,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore,
      tq: input.tq,
    };
  }

  if (input.targetPlan !== nextPlan) {
    return {
      allowed: false,
      code: "must_upgrade_step_by_step",
      message: `当前仅允许逐级升级到 ${nextPlan}。`,
      currentPaidPlan,
      nextPlan,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore,
      tq: input.tq,
    };
  }

  // Rule 1: T0 trial/paid can always upgrade to T1 once trial lifecycle is started.
  if ((input.currentPlan === "T0_trial" || input.currentPlan === "T0_paid") && input.targetPlan === "T1") {
    return {
      allowed: true,
      code: "ok",
      message: "满足升级条件。",
      currentPaidPlan,
      nextPlan,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore: 0,
      tq: input.tq,
    };
  }

  // Rule 2: users with paid video subscription can upgrade to next tier without extra payment.
  if (input.freeByVideoSubscription) {
    return {
      allowed: true,
      code: "ok",
      message: "已开通视频订阅，可免额外付费升级。",
      freeByVideoSubscription: true,
      currentPaidPlan,
      nextPlan,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore: 0,
      tq: input.tq,
    };
  }

  if (!input.tq.eligibleByTrades) {
    const missingTrades = Math.max(0, input.tq.minTradesForScore - input.tq.tradeCount);
    return {
      allowed: false,
      code: "not_enough_trades",
      message: `本月交易笔数不足，至少需要 ${input.tq.minTradesForScore} 笔（还差 ${missingTrades} 笔）。`,
      currentPaidPlan,
      nextPlan,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore,
      tq: input.tq,
    };
  }

  if (input.tq.totalScore < requiredScore) {
    return {
      allowed: false,
      code: "score_not_enough",
      message: `升级到 ${input.targetPlan} 需要月度 TQ >= ${requiredScore}，当前 ${input.tq.totalScore.toFixed(2)}。`,
      currentPaidPlan,
      nextPlan,
      targetPlan: input.targetPlan,
      requiredScore,
      missingScore,
      tq: input.tq,
    };
  }

  return {
    allowed: true,
    code: "ok",
    message: "满足升级条件。",
    currentPaidPlan,
    nextPlan,
    targetPlan: input.targetPlan,
    requiredScore,
    missingScore: 0,
    tq: input.tq,
  };
}
