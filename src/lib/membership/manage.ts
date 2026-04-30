import type { SupabaseClient } from "@supabase/supabase-js";

import { burnPoints, TQ_POINTS_RULES } from "@/lib/membership/points";

type ManualGrantInput = {
	userId: string;
	tier: "T2" | "T3";
	months?: number;
	operatorUserId?: string;
	note?: string;
	source?: "payment" | "manual";
};

function addDaysIso(base: Date, days: number): string {
	return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function upsertBaseMembership(
	supabase: SupabaseClient,
	userId: string,
): Promise<void> {
	const { data } = await supabase
		.from("membership_accounts")
		.select("user_id")
		.eq("user_id", userId)
		.maybeSingle();
	if (data?.user_id) return;
	const now = new Date();
	const { error } = await supabase.from("membership_accounts").insert({
		user_id: userId,
		tier: "T1",
		status: "trialing",
		trial_start_at: now.toISOString(),
		trial_end_at: addDaysIso(now, 7),
	});
	if (error) {
		// 并发初始化时允许唯一键冲突，后续读取即可。
		if ((error as { code?: string }).code === "23505") return;
		throw new Error(error.message);
	}
}

export async function grantMembershipByAdmin(
	supabase: SupabaseClient,
	input: ManualGrantInput,
): Promise<{ periodEnd: string | null }> {
	await upsertBaseMembership(supabase, input.userId);
	const now = new Date();
	if (input.tier === "T2") {
		const { error } = await supabase
			.from("membership_accounts")
			.update({
				tier: "T2",
				status: "active",
				current_period_start: null,
				current_period_end: null,
				last_paid_at: now.toISOString(),
			})
			.eq("user_id", input.userId);
		if (error) throw new Error(error.message);
		return { periodEnd: null };
	}

	const months = Math.max(1, Math.trunc(input.months ?? 1));
	const { data: account, error: qErr } = await supabase
		.from("membership_accounts")
		.select("current_period_end")
		.eq("user_id", input.userId)
		.maybeSingle();
	if (qErr) throw new Error(qErr.message);
	const base =
		account?.current_period_end && new Date(account.current_period_end).getTime() > now.getTime()
			? new Date(account.current_period_end)
			: now;
	const periodEnd = addDaysIso(base, months * 30);
	const { error: updErr } = await supabase
		.from("membership_accounts")
		.update({
			tier: "T3",
			status: "active",
			current_period_start: now.toISOString(),
			current_period_end: periodEnd,
			last_paid_at: now.toISOString(),
		})
		.eq("user_id", input.userId);
	if (updErr) throw new Error(updErr.message);

	const { error: passErr } = await supabase.from("t3_access_passes").insert({
		user_id: input.userId,
		source: input.source ?? "manual",
		duration_days: months * 30,
		points_cost: 0,
		start_at: now.toISOString(),
		end_at: periodEnd,
		metadata: { note: input.note ?? "", tier: "T3", grantType: "admin" },
		created_by: input.operatorUserId ?? null,
	});
	if (passErr) throw new Error(passErr.message);

	return { periodEnd };
}

export async function redeemT3ByPoints(
	supabase: SupabaseClient,
	userId: string,
	planId: string,
): Promise<{ planId: string; days: number; pointsCost: number; periodEnd: string }> {
	await upsertBaseMembership(supabase, userId);
	const plan = TQ_POINTS_RULES.t3RedeemPlans.find((p) => p.planId === planId);
	if (!plan) {
		throw new Error("无效兑换方案");
	}
	const burn = await burnPoints(supabase, {
		userId,
		source: "t3_redeem",
		delta: plan.pointsCost,
		referenceId: plan.planId,
		metadata: { planId: plan.planId, days: plan.days },
	});
	if (burn.appliedDelta <= 0) {
		throw new Error("积分不足");
	}

	const now = new Date();
	const { data: account, error: qErr } = await supabase
		.from("membership_accounts")
		.select("current_period_end")
		.eq("user_id", userId)
		.maybeSingle();
	if (qErr) throw new Error(qErr.message);
	const base =
		account?.current_period_end && new Date(account.current_period_end).getTime() > now.getTime()
			? new Date(account.current_period_end)
			: now;
	const periodEnd = addDaysIso(base, plan.days);

	const { error: updErr } = await supabase
		.from("membership_accounts")
		.update({
			tier: "T3",
			status: "active",
			current_period_start: now.toISOString(),
			current_period_end: periodEnd,
		})
		.eq("user_id", userId);
	if (updErr) throw new Error(updErr.message);

	const { error: passErr } = await supabase.from("t3_access_passes").insert({
		user_id: userId,
		source: "points",
		duration_days: plan.days,
		points_cost: plan.pointsCost,
		start_at: now.toISOString(),
		end_at: periodEnd,
		metadata: { planId: plan.planId },
	});
	if (passErr) throw new Error(passErr.message);

	return { planId: plan.planId, days: plan.days, pointsCost: plan.pointsCost, periodEnd };
}
