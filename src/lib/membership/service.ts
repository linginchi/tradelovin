import type { SupabaseClient } from "@supabase/supabase-js";

import type { MembershipSnapshot, MembershipTier } from "@/lib/membership/types";

type MembershipAccountRow = {
	user_id: string;
	tier: MembershipTier;
	status: "active" | "paused" | "expired" | "trialing";
	trial_start_at: string;
	trial_end_at: string;
	current_period_start: string | null;
	current_period_end: string | null;
	last_paid_at: string | null;
};

type MembershipEntitlementRow = {
	sim_trading: boolean;
	tq_report: boolean;
	l2_market: boolean;
	advanced_order_bundle: boolean;
};

export function isPeriodActive(periodEnd: string | null): boolean {
	if (!periodEnd) return false;
	const t = new Date(periodEnd).getTime();
	return Number.isFinite(t) && t >= Date.now();
}

function readTierCapabilities(
	tier: MembershipTier,
	account: MembershipAccountRow,
	entitlements: MembershipEntitlementRow | null,
) {
	const trialActive = new Date(account.trial_end_at).getTime() >= Date.now();
	const periodActive = isPeriodActive(account.current_period_end);

	// 以业务规则为主，DB entitlement 用于兼容/兜底。
	if (tier === "T1") {
		const simTrading = entitlements?.sim_trading ?? (trialActive || periodActive);
		return {
			simTrading,
			tqReport: false,
			l2Market: false,
			advancedOrderBundle: false,
		};
	}
	if (tier === "T2") {
		return {
			simTrading: true,
			tqReport: true,
			l2Market: false,
			advancedOrderBundle: false,
		};
	}
	// T3 到期后回落为 T2 权益；未到期则全开
	if (!periodActive) {
		return {
			simTrading: true,
			tqReport: true,
			l2Market: false,
			advancedOrderBundle: false,
		};
	}
	return {
		simTrading: true,
		tqReport: true,
		l2Market: true,
		advancedOrderBundle: true,
	};
}

export async function getMembershipSnapshot(
	supabase: SupabaseClient,
	userId: string,
): Promise<MembershipSnapshot | null> {
	const [{ data: account, error: accountErr }, { data: entitlement }, { data: latestLedger }] =
		await Promise.all([
			supabase
				.from("membership_accounts")
				.select(
					"user_id,tier,status,trial_start_at,trial_end_at,current_period_start,current_period_end,last_paid_at",
				)
				.eq("user_id", userId)
				.maybeSingle(),
			supabase
				.from("membership_entitlements")
				.select("sim_trading,tq_report,l2_market,advanced_order_bundle")
				.eq("user_id", userId)
				.maybeSingle(),
			supabase
				.from("tq_points_ledger")
				.select("balance_after")
				.eq("user_id", userId)
				.order("created_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
		]);

	if (accountErr || !account) {
		return null;
	}

	const caps = readTierCapabilities(account.tier as MembershipTier, account as MembershipAccountRow, entitlement as MembershipEntitlementRow | null);
	const pointsBalance = Number(latestLedger?.balance_after ?? 0);
	return {
		userId,
		tier: account.tier as MembershipTier,
		status: account.status as MembershipSnapshot["status"],
		trialStartAt: String(account.trial_start_at),
		trialEndAt: String(account.trial_end_at),
		currentPeriodStart: (account.current_period_start as string | null) ?? null,
		currentPeriodEnd: (account.current_period_end as string | null) ?? null,
		lastPaidAt: (account.last_paid_at as string | null) ?? null,
		pointsBalance: Number.isFinite(pointsBalance) ? pointsBalance : 0,
		effective: caps,
	};
}
