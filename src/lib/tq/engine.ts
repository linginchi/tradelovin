import type { SupabaseClient } from "@supabase/supabase-js";

import {
	DEFAULT_DIMENSION_WEIGHTS,
	DEFAULT_FEATURE_WEIGHTS,
	FEATURE_DIRECTION,
	TQ_DIMENSIONS,
	TQ_FEATURES,
	type TqDimension,
	type TqEnvironment,
	type TqFeatureName,
	type TqPeriod,
} from "@/lib/tq/constants";

type TradeRow = {
	user_id: string | null;
	symbol: string;
	side: "buy" | "sell";
	price: number;
	quantity: number;
	commission: number;
	stamp_tax: number;
	trade_time: string;
};

type FeatureMap = Record<TqFeatureName, number>;

export type TqUserResult = {
	userId: string;
	environment: TqEnvironment;
	period: TqPeriod;
	features: FeatureMap;
	normalized: FeatureMap;
	dimensions: Record<TqDimension, number>;
	totalScore: number;
	tradeCount: number;
	tradeDays: number;
};

type ConfigShape = {
	featureWeights: Record<TqDimension, Record<TqFeatureName, number>>;
	dimensionWeights: Record<TqDimension, number>;
};

function zeroFeatures(): FeatureMap {
	return Object.fromEntries(TQ_FEATURES.map((f) => [f, 0])) as FeatureMap;
}

function round2(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.round(v * 100) / 100;
}

function mean(nums: number[]): number {
	if (!nums.length) return 0;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number {
	if (nums.length <= 1) return 0;
	const m = mean(nums);
	const variance = nums.reduce((acc, n) => acc + (n - m) ** 2, 0) / nums.length;
	return Math.sqrt(variance);
}

function quantile(sorted: number[], q: number): number {
	if (!sorted.length) return 0;
	if (q <= 0) return sorted[0] ?? 0;
	if (q >= 1) return sorted[sorted.length - 1] ?? 0;
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	const left = sorted[base] ?? sorted[0] ?? 0;
	const right = sorted[base + 1] ?? left;
	return left + rest * (right - left);
}

function longestWinningStreak(dayPnlEntries: Array<[string, number]>): number {
	let best = 0;
	let current = 0;
	for (const [, pnl] of dayPnlEntries) {
		if (pnl > 0) {
			current += 1;
			best = Math.max(best, current);
		} else {
			current = 0;
		}
	}
	return best;
}

function calcMaxDrawdown(pnls: number[]): number {
	let peak = 0;
	let running = 0;
	let maxDd = 0;
	for (const delta of pnls) {
		running += delta;
		peak = Math.max(peak, running);
		if (peak > 0) {
			maxDd = Math.max(maxDd, (peak - running) / peak);
		}
	}
	return maxDd;
}

function percentileScore(value: number, baselineValues: number[], higherBetter: boolean): number {
	const values = baselineValues.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
	if (!values.length) return 0;
	if (values.length === 1) return 100;
	const min = values[0] ?? 0;
	const max = values[values.length - 1] ?? 0;
	if (value <= min) return higherBetter ? 0 : 100;
	if (value >= max) return higherBetter ? 100 : 0;

	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if ((values[mid] ?? 0) <= value) lo = mid + 1;
		else hi = mid;
	}
	const rank = (lo - 1) / (values.length - 1);
	const p = higherBetter ? rank : 1 - rank;
	return round2(Math.max(0, Math.min(100, p * 100)));
}

function computeUserFeatures(rows: TradeRow[]): { features: FeatureMap; tradeCount: number; tradeDays: number } {
	if (!rows.length) {
		return { features: zeroFeatures(), tradeCount: 0, tradeDays: 0 };
	}
	const sorted = [...rows].sort((a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime());

	let totalPnl = 0;
	let totalTurnover = 0;
	let winCount = 0;
	let positivePnlSum = 0;
	const losses: number[] = [];
	const negEffs: number[] = [];
	const quantities: number[] = [];
	const pnlSeries: number[] = [];
	const dayPnl = new Map<string, number>();
	const dayTurnover = new Map<string, number>();
	const daySymbols = new Map<string, Set<string>>();

	for (const row of sorted) {
		const turnover = Number(row.price) * Number(row.quantity);
		const fee = Number(row.commission) + Number(row.stamp_tax);
		const cashflow = row.side === "sell" ? turnover - fee : -turnover - fee;
		totalPnl += cashflow;
		totalTurnover += turnover;
		quantities.push(Number(row.quantity) || 0);
		pnlSeries.push(cashflow);
		if (cashflow > 0) {
			winCount += 1;
			positivePnlSum += cashflow;
		} else if (cashflow < 0) {
			const lossAbs = Math.abs(cashflow);
			losses.push(lossAbs);
			negEffs.push(turnover > 0 ? lossAbs / turnover : 0);
		}

		const day = row.trade_time.slice(0, 10);
		dayPnl.set(day, (dayPnl.get(day) ?? 0) + cashflow);
		dayTurnover.set(day, (dayTurnover.get(day) ?? 0) + turnover);
		const set = daySymbols.get(day) ?? new Set<string>();
		set.add(row.symbol);
		daySymbols.set(day, set);
	}

	const dayEntries = [...dayPnl.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const dayEffs = dayEntries.map(([day, pnl]) => {
		const t = dayTurnover.get(day) ?? 0;
		return t > 0 ? pnl / t : 0;
	});
	const dayReturns = dayEffs;
	const downside = dayReturns.filter((v) => v < 0).map((v) => Math.abs(v));
	const downsideStd = stdDev(downside);
	const sortedEffs = [...dayEffs].sort((a, b) => a - b);

	const firstDay = dayEntries[0]?.[0] ?? "";
	const lastDay = dayEntries[dayEntries.length - 1]?.[0] ?? "";
	const lifeDays =
		firstDay && lastDay
			? Math.max(
					1,
					Math.floor(
						(new Date(`${lastDay}T00:00:00Z`).getTime() - new Date(`${firstDay}T00:00:00Z`).getTime()) /
							86400000,
					) + 1,
				)
			: 1;

	const tradeCount = sorted.length;
	const tradeDays = dayEntries.length;
	const winningDayCount = dayEntries.filter(([, pnl]) => pnl > 0).length;
	const maxLoss = losses.length ? Math.max(...losses) : 0;

	const features: FeatureMap = {
		AllTimePnl: totalPnl,
		AvgDailyPnl: tradeDays > 0 ? totalPnl / tradeDays : 0,
		WinRatio: tradeCount > 0 ? winCount / tradeCount : 0,
		WinningDayRatio: tradeDays > 0 ? winningDayCount / tradeDays : 0,
		Streak: longestWinningStreak(dayEntries),
		PnlEfficiency: totalTurnover > 0 ? totalPnl / totalTurnover : 0,
		EffSharpeRatio: (() => {
			const s = stdDev(dayEffs);
			if (s <= 0) return mean(dayEffs) > 0 ? 10 : 0;
			return mean(dayEffs) / s;
		})(),
		MinNegPnl: maxLoss,
		MaxDrawDown: calcMaxDrawdown(pnlSeries),
		PotentialRisk: losses.length > 0 && totalTurnover > 0 ? losses.reduce((a, b) => a + b, 0) / totalTurnover : 0,
		RiskOverPnl: positivePnlSum > 0 ? (losses.reduce((a, b) => a + b, 0) / Math.max(1, losses.length)) / positivePnlSum : 0,
		EffVar: quantile(sortedEffs, 0.05),
		StdNegEff: stdDev(negEffs),
		StdQuantity: stdDev(quantities),
		SortinoRatio: downsideStd > 0 ? mean(dayReturns) / downsideStd : mean(dayReturns) > 0 ? 10 : 0,
		DivConsistency: stdDev([...daySymbols.values()].map((s) => s.size)),
		TradeDays: tradeDays,
		TradeCount: tradeCount,
		ActiveRatio: lifeDays > 0 ? tradeDays / lifeDays : 0,
	};

	return { features, tradeCount, tradeDays };
}

function weightedAverage(scores: Record<TqFeatureName, number>, weights: Record<TqFeatureName, number>): number {
	let numerator = 0;
	let denominator = 0;
	for (const feature of TQ_FEATURES) {
		const w = Number(weights[feature] ?? 0);
		if (w <= 0) continue;
		numerator += (scores[feature] ?? 0) * w;
		denominator += w;
	}
	return denominator > 0 ? round2(numerator / denominator) : 0;
}

async function loadConfig(srv: SupabaseClient): Promise<ConfigShape> {
	const { data } = await srv.from("tq_config").select("key,value");
	const featureWeights =
		(data ?? []).find((x) => x.key === "feature_weights")?.value ?? DEFAULT_FEATURE_WEIGHTS;
	const dimensionWeights =
		(data ?? []).find((x) => x.key === "dimension_weights")?.value ?? DEFAULT_DIMENSION_WEIGHTS;
	return {
		featureWeights: featureWeights as ConfigShape["featureWeights"],
		dimensionWeights: dimensionWeights as ConfigShape["dimensionWeights"],
	};
}

async function writeUserResult(srv: SupabaseClient, result: TqUserResult): Promise<void> {
	const calcTime = new Date().toISOString();
	const featureRows = TQ_FEATURES.map((feature) => ({
		user_id: result.userId,
		period: result.period,
		environment: result.environment,
		feature_name: feature,
		raw_value: round2(result.features[feature] ?? 0),
		norm_score: round2(result.normalized[feature] ?? 0),
		calc_time: calcTime,
	}));
	const scoreRows = TQ_DIMENSIONS.map((dimension) => ({
		user_id: result.userId,
		period: result.period,
		environment: result.environment,
		dimension,
		score: round2(result.dimensions[dimension] ?? 0),
		total_score: round2(result.totalScore),
		calc_time: calcTime,
	}));

	await srv
		.from("tq_features")
		.upsert(featureRows, { onConflict: "user_id,period,environment,feature_name" });
	await srv.from("tq_scores").upsert(scoreRows, { onConflict: "user_id,period,environment,dimension" });
}

export async function recalculateTqAllUsers(
	srv: SupabaseClient,
	params: { environment?: TqEnvironment; period?: TqPeriod } = {},
): Promise<{ users: TqUserResult[]; baselineUserIds: string[] }> {
	const environment = params.environment ?? "sim";
	const period = params.period ?? "all";

	const { data: rawTrades, error } = await srv
		.from("sim_trades")
		.select("user_id,symbol,side,price,quantity,commission,stamp_tax,trade_time")
		.eq("environment", environment)
		.not("user_id", "is", null)
		.order("trade_time", { ascending: true });
	if (error) {
		throw new Error(`加载交易数据失败: ${error.message}`);
	}

	const grouped = new Map<string, TradeRow[]>();
	for (const row of (rawTrades ?? []) as TradeRow[]) {
		if (!row.user_id) continue;
		const list = grouped.get(row.user_id) ?? [];
		list.push(row);
		grouped.set(row.user_id, list);
	}

	const userBase = [...grouped.entries()].map(([userId, rows]) => {
		const featureResult = computeUserFeatures(rows);
		return {
			userId,
			rows,
			features: featureResult.features,
			tradeCount: featureResult.tradeCount,
			tradeDays: featureResult.tradeDays,
		};
	});

	const { data: baselineRows } = await srv.from("tq_baseline_users").select("user_id");
	const explicitBaselineIds = new Set((baselineRows ?? []).map((x) => String(x.user_id)));
	const autoBaseline = userBase
		.filter((u) => u.tradeCount >= 100 && u.tradeDays >= 30)
		.filter((u) => {
			const wr = u.features.WinRatio;
			return wr >= 0.4 && wr <= 0.6;
		})
		.map((u) => u.userId);
	const baselineIds = explicitBaselineIds.size
		? [...explicitBaselineIds].filter((id) => grouped.has(id))
		: autoBaseline.length
			? autoBaseline
			: userBase.filter((u) => u.tradeCount >= 10).map((u) => u.userId);

	const baselineSet = new Set(baselineIds);
	const baselineDistributions = Object.fromEntries(
		TQ_FEATURES.map((feature) => [
			feature,
			userBase.filter((u) => baselineSet.has(u.userId)).map((u) => u.features[feature]),
		]),
	) as Record<TqFeatureName, number[]>;

	const config = await loadConfig(srv);
	const userResults: TqUserResult[] = [];

	for (const u of userBase) {
		const coldStart = u.tradeCount < 10;
		const normalized = zeroFeatures();
		if (!coldStart) {
			for (const feature of TQ_FEATURES) {
				const direction = FEATURE_DIRECTION[feature] === "higher_better";
				normalized[feature] = percentileScore(u.features[feature], baselineDistributions[feature], direction);
			}
		}
		const dimensions = {
			profitability: weightedAverage(normalized, config.featureWeights.profitability),
			risk_control: weightedAverage(normalized, config.featureWeights.risk_control),
			consistency: weightedAverage(normalized, config.featureWeights.consistency),
			activeness: weightedAverage(normalized, config.featureWeights.activeness),
		} as Record<TqDimension, number>;
		const totalScore = round2(
			TQ_DIMENSIONS.reduce(
				(sum, d) => sum + dimensions[d] * Number(config.dimensionWeights[d] ?? 0),
				0,
			),
		);
		userResults.push({
			userId: u.userId,
			environment,
			period,
			features: u.features,
			normalized,
			dimensions,
			totalScore: coldStart ? 0 : totalScore,
			tradeCount: u.tradeCount,
			tradeDays: u.tradeDays,
		});
	}

	for (const result of userResults) {
		if (result.tradeCount < 10) {
			result.totalScore = 0;
			result.normalized = zeroFeatures();
			result.dimensions = {
				profitability: 0,
				risk_control: 0,
				consistency: 0,
				activeness: 0,
			};
		}
		await writeUserResult(srv, result);
	}
	return { users: userResults, baselineUserIds: baselineIds };
}

export async function ensureTqCalculated(
	srv: SupabaseClient,
	params: { userId: string; environment?: TqEnvironment; period?: TqPeriod },
): Promise<void> {
	const environment = params.environment ?? "sim";
	const period = params.period ?? "all";
	const { data, error } = await srv
		.from("tq_scores")
		.select("user_id")
		.eq("user_id", params.userId)
		.eq("environment", environment)
		.eq("period", period)
		.limit(1);
	if (error) throw new Error(`读取TQ失败: ${error.message}`);
	if ((data ?? []).length > 0) return;
	await recalculateTqAllUsers(srv, { environment, period });
}

export async function getTqConfig(srv: SupabaseClient): Promise<ConfigShape> {
	return loadConfig(srv);
}
