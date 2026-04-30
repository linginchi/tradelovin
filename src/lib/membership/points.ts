import type { SupabaseClient } from "@supabase/supabase-js";

export const TQ_POINTS_RULES = {
	dailyLogin: { source: "daily_login", points: 2, dailyCap: 2 },
	simTradeQualified: { source: "sim_trade_qualified", points: 5, dailyCap: 20 },
	courseUnitPassed: { source: "course_unit_passed", points: 20, dailyCap: 100 },
	streak7dBonus: { source: "streak_7d_bonus", points: 30, dailyCap: 30 },
	inviteQualified: { source: "invite_qualified", points: 50, dailyCap: 200 },
	t3RedeemPlans: [
		{ planId: "t3_7d", days: 7, pointsCost: 300 },
		{ planId: "t3_30d", days: 30, pointsCost: 1000 },
	],
} as const;

type AwardInput = {
	userId: string;
	source: string;
	delta: number;
	dailyCap?: number;
	referenceId?: string;
	metadata?: Record<string, unknown>;
};

function hkDayRange(now = new Date()) {
	// Asia/Hong_Kong: UTC+8，按自然日计算积分上限
	const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
	const hk = new Date(utc + 8 * 60 * 60 * 1000);
	const y = hk.getUTCFullYear();
	const m = hk.getUTCMonth();
	const d = hk.getUTCDate();
	const startHk = new Date(Date.UTC(y, m, d, 0, 0, 0));
	const endHk = new Date(Date.UTC(y, m, d + 1, 0, 0, 0));
	return {
		startUtcIso: new Date(startHk.getTime() - 8 * 60 * 60 * 1000).toISOString(),
		endUtcIso: new Date(endHk.getTime() - 8 * 60 * 60 * 1000).toISOString(),
	};
}

export async function getPointsBalance(supabase: SupabaseClient, userId: string): Promise<number> {
	const { data } = await supabase
		.from("tq_points_ledger")
		.select("balance_after")
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	const n = Number(data?.balance_after ?? 0);
	return Number.isFinite(n) ? n : 0;
}

async function getTodayEarnedBySource(
	supabase: SupabaseClient,
	userId: string,
	source: string,
): Promise<number> {
	const { startUtcIso, endUtcIso } = hkDayRange();
	const { data } = await supabase
		.from("tq_points_ledger")
		.select("delta")
		.eq("user_id", userId)
		.eq("source", source)
		.gte("created_at", startUtcIso)
		.lt("created_at", endUtcIso);
	return (data ?? []).reduce((sum, row) => sum + Math.max(Number(row.delta ?? 0), 0), 0);
}

async function appendLedger(
	supabase: SupabaseClient,
	input: AwardInput & { changeType: "earn" | "burn" | "expire" | "adjust"; appliedDelta: number; nextBalance: number },
) {
	const { error } = await supabase.from("tq_points_ledger").insert({
		user_id: input.userId,
		change_type: input.changeType,
		source: input.source,
		delta: input.appliedDelta,
		balance_after: input.nextBalance,
		reference_id: input.referenceId ?? null,
		metadata: input.metadata ?? {},
	});
	if (error) throw new Error(error.message);
}

export async function awardPoints(
	supabase: SupabaseClient,
	input: AwardInput,
): Promise<{ appliedDelta: number; balanceAfter: number }> {
	if (!Number.isFinite(input.delta) || input.delta <= 0) {
		return { appliedDelta: 0, balanceAfter: await getPointsBalance(supabase, input.userId) };
	}
	let appliedDelta = Math.trunc(input.delta);
	if (input.referenceId) {
		const { data: existing } = await supabase
			.from("tq_points_ledger")
			.select("id,balance_after")
			.eq("user_id", input.userId)
			.eq("source", input.source)
			.eq("reference_id", input.referenceId)
			.limit(1)
			.maybeSingle();
		if (existing) {
			return {
				appliedDelta: 0,
				balanceAfter: Number(existing.balance_after ?? (await getPointsBalance(supabase, input.userId))),
			};
		}
	}
	if (input.dailyCap && input.dailyCap > 0) {
		const todayEarned = await getTodayEarnedBySource(supabase, input.userId, input.source);
		const remain = Math.max(input.dailyCap - todayEarned, 0);
		appliedDelta = Math.min(appliedDelta, remain);
	}
	const currentBalance = await getPointsBalance(supabase, input.userId);
	if (appliedDelta <= 0) {
		return { appliedDelta: 0, balanceAfter: currentBalance };
	}
	const nextBalance = currentBalance + appliedDelta;
	await appendLedger(supabase, {
		...input,
		changeType: "earn",
		appliedDelta,
		nextBalance,
	});
	return { appliedDelta, balanceAfter: nextBalance };
}

export async function burnPoints(
	supabase: SupabaseClient,
	input: Omit<AwardInput, "dailyCap" | "delta"> & { delta: number },
): Promise<{ appliedDelta: number; balanceAfter: number }> {
	const burn = Math.max(0, Math.trunc(input.delta));
	const currentBalance = await getPointsBalance(supabase, input.userId);
	if (burn <= 0 || currentBalance < burn) {
		return { appliedDelta: 0, balanceAfter: currentBalance };
	}
	const nextBalance = currentBalance - burn;
	await appendLedger(supabase, {
		...input,
		changeType: "burn",
		appliedDelta: -burn,
		nextBalance,
	});
	return { appliedDelta: burn, balanceAfter: nextBalance };
}

export async function adjustPoints(
	supabase: SupabaseClient,
	input: Omit<AwardInput, "dailyCap">,
): Promise<{ appliedDelta: number; balanceAfter: number }> {
	if (!Number.isFinite(input.delta) || Math.trunc(input.delta) === 0) {
		return { appliedDelta: 0, balanceAfter: await getPointsBalance(supabase, input.userId) };
	}
	const delta = Math.trunc(input.delta);
	const currentBalance = await getPointsBalance(supabase, input.userId);
	const nextBalance = currentBalance + delta;
	if (nextBalance < 0) {
		throw new Error("调整后积分不能小于0");
	}
	await appendLedger(supabase, {
		...input,
		changeType: "adjust",
		appliedDelta: delta,
		nextBalance,
	});
	return { appliedDelta: delta, balanceAfter: nextBalance };
}

export async function maybeAwardDailyLogin(
	supabase: SupabaseClient,
	userId: string,
): Promise<{ loginAwarded: number; streakAwarded: number; balanceAfter: number }> {
	const login = TQ_POINTS_RULES.dailyLogin;
	const loginRes = await awardPoints(supabase, {
		userId,
		source: login.source,
		delta: login.points,
		dailyCap: login.dailyCap,
		metadata: { rule: "daily_login" },
	});
	let streakAwarded = 0;
	let balanceAfter = loginRes.balanceAfter;
	if (loginRes.appliedDelta > 0) {
		const { startUtcIso } = hkDayRange();
		const { data } = await supabase
			.from("tq_points_ledger")
			.select("created_at")
			.eq("user_id", userId)
			.eq("source", TQ_POINTS_RULES.dailyLogin.source)
			.lt("created_at", startUtcIso)
			.order("created_at", { ascending: false })
			.limit(6);
		if ((data ?? []).length >= 6) {
			const bonus = await awardPoints(supabase, {
				userId,
				source: TQ_POINTS_RULES.streak7dBonus.source,
				delta: TQ_POINTS_RULES.streak7dBonus.points,
				dailyCap: TQ_POINTS_RULES.streak7dBonus.dailyCap,
				metadata: { rule: "streak_7d" },
			});
			streakAwarded = bonus.appliedDelta;
			balanceAfter = bonus.balanceAfter;
		}
	}
	return { loginAwarded: loginRes.appliedDelta, streakAwarded, balanceAfter };
}
