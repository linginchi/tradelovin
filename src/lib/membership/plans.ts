import { getPriceId, type BillingCycle, type PaidPlan } from "@/lib/billing/stripe";

export type MembershipPeriod = "monthly" | "yearly";

export type PlanPriceConfig = {
  monthly: number;
  yearly: number;
};

export const MEMBERSHIP_PLAN_PRICES: Record<PaidPlan, PlanPriceConfig> = {
  T1: { monthly: 49, yearly: 499 },
  T2: { monthly: 99, yearly: 999 },
  T3: { monthly: 299, yearly: 2999 },
};

export const PLAN_RIGHTS: Record<PaidPlan, string[]> = {
  T1: ["模拟交易", "课程折扣", "训练建议"],
  T2: ["P1 · 雪豹全部权益", "深度 TQ 报告", "交易证书"],
  T3: ["P2 · 云豹全部权益", "L2 行情", "高级策略能力"],
};

export function toBillingCycle(period: MembershipPeriod): BillingCycle {
  return period === "yearly" ? "year" : "month";
}

export function fromBillingCycle(cycle: BillingCycle): MembershipPeriod {
  return cycle === "year" ? "yearly" : "monthly";
}

export function getAmountByPlan(plan: PaidPlan, period: MembershipPeriod): number {
  return MEMBERSHIP_PLAN_PRICES[plan][period];
}

export function getStripePriceIdByPlan(plan: PaidPlan, period: MembershipPeriod): string {
  const cycle = toBillingCycle(period);
  return getPriceId(plan, cycle);
}

export function resolvePeriod(input: unknown): MembershipPeriod | null {
  if (input === "monthly" || input === "yearly") return input;
  return null;
}

export function resolvePlan(input: unknown): PaidPlan | null {
  if (input === "T1" || input === "T2" || input === "T3") return input;
  return null;
}

export function getManualPaymentBankInfo() {
  return {
    bankName: process.env.FPS_BANK_NAME ?? "Hong Kong FPS",
    accountName: process.env.FPS_ACCOUNT_NAME ?? "TradeLovin Limited",
    fpsId: process.env.FPS_ACCOUNT_ID ?? "FPS-TRADLOVIN-001",
    qrCodeUrl: process.env.FPS_QR_CODE_URL ?? "",
    note: process.env.FPS_PAYMENT_NOTE ?? "转账后请上传凭证等待人工审核",
  };
}
