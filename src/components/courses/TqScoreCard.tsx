"use client";

import SkillRadarPanel from "@/components/scores/SkillRadarPanel";

type Locale = "zh" | "zh-TW" | "en";
type TqEnv = "sim" | "live";

type TqScore = {
	totalScore: number;
	calcTime?: string;
	dimensions: {
		profitability: number;
		riskControl: number;
		consistency: number;
		activeness: number;
	};
};

type TqFeatureItem = {
	featureName: string;
	rawValue: number;
	normScore: number;
	calcTime?: string;
};

const FEATURE_GROUPS: Array<{ id: "profitability" | "riskControl" | "activeness" | "consistency"; features: string[] }> = [
	{
		id: "profitability",
		features: ["AllTimePnl", "AvgDailyPnl", "WinRatio", "WinningDayRatio", "PnlEfficiency", "EffSharpeRatio"],
	},
	{
		id: "riskControl",
		features: ["MaxDrawDown", "PotentialRisk", "RiskOverPnl", "EffVar", "MinNegPnl"],
	},
	{
		id: "activeness",
		features: ["TradeDays", "TradeCount", "ActiveRatio"],
	},
	{
		id: "consistency",
		features: ["StdNegEff", "StdQuantity", "SortinoRatio", "DivConsistency", "Streak"],
	},
];

function readLocale(locale: string): Locale {
	if (locale === "en" || locale === "zh-TW") return locale;
	return "zh";
}

function fmt2(v: number): string {
	return (Number.isFinite(v) ? v : 0).toFixed(2);
}

function readCopy(localeRaw: string) {
	const locale = readLocale(localeRaw);
	if (locale === "en") {
		return {
			title: "TradeQuotient",
			envSim: "Simulation",
			envLive: "Live",
			noData: "No score available yet. Complete trades to generate your TQ profile.",
			mainRadar: "TQ Core Radar",
			lastUpdate: "Last update",
			dimensions: {
				profitability: "Profitability",
				riskControl: "Risk Control",
				consistency: "Consistency",
				activeness: "Activeness",
			},
			groupTitles: {
				profitability: "Profitability Radar",
				riskControl: "Risk Control Radar",
				activeness: "Activity Radar",
				consistency: "Consistency Radar",
			},
		};
	}
	if (locale === "zh-TW") {
		return {
			title: "TradeQuotient",
			envSim: "模擬",
			envLive: "實盤",
			noData: "暫無評分，完成交易後會自動生成 TQ 畫像。",
			mainRadar: "TQ 核心雷達",
			lastUpdate: "最近更新",
			dimensions: {
				profitability: "盈利能力",
				riskControl: "風控能力",
				consistency: "穩定性",
				activeness: "活躍度",
			},
			groupTitles: {
				profitability: "盈利能力雷達",
				riskControl: "風控雷達",
				activeness: "活躍度雷達",
				consistency: "穩定性雷達",
			},
		};
	}
	return {
		title: "TradeQuotient",
		envSim: "模拟",
		envLive: "实盘",
		noData: "暂无评分，完成交易后会自动生成 TQ 画像。",
		mainRadar: "TQ 核心雷达",
		lastUpdate: "最近更新",
		dimensions: {
			profitability: "盈利能力",
			riskControl: "风控能力",
			consistency: "稳定性",
			activeness: "活跃度",
		},
		groupTitles: {
			profitability: "盈利能力雷达",
			riskControl: "风控雷达",
			activeness: "活跃度雷达",
			consistency: "稳定性雷达",
		},
	};
}

function readFeatureLabel(featureName: string, localeRaw: string): string {
	const locale = readLocale(localeRaw);
	const map: Record<string, { zh: string; zhTW: string; en: string }> = {
		AllTimePnl: { zh: "累计收益", zhTW: "累計收益", en: "All-time PnL" },
		AvgDailyPnl: { zh: "日均收益", zhTW: "日均收益", en: "Avg Daily PnL" },
		WinRatio: { zh: "胜率", zhTW: "勝率", en: "Win Ratio" },
		WinningDayRatio: { zh: "盈利天占比", zhTW: "盈利天佔比", en: "Winning Day Ratio" },
		Streak: { zh: "连胜表现", zhTW: "連勝表現", en: "Winning Streak" },
		PnlEfficiency: { zh: "收益效率", zhTW: "收益效率", en: "PnL Efficiency" },
		EffSharpeRatio: { zh: "夏普效率", zhTW: "夏普效率", en: "Eff Sharpe Ratio" },
		MinNegPnl: { zh: "单次最大亏损", zhTW: "單次最大虧損", en: "Worst Loss" },
		MaxDrawDown: { zh: "最大回撤", zhTW: "最大回撤", en: "Max Drawdown" },
		PotentialRisk: { zh: "潜在风险", zhTW: "潛在風險", en: "Potential Risk" },
		RiskOverPnl: { zh: "风险收益比", zhTW: "風險收益比", en: "Risk / PnL" },
		EffVar: { zh: "收益波动", zhTW: "收益波動", en: "Return Variance" },
		StdNegEff: { zh: "负收益波动", zhTW: "負收益波動", en: "Std Neg Return" },
		StdQuantity: { zh: "仓位波动", zhTW: "倉位波動", en: "Position Volatility" },
		SortinoRatio: { zh: "索提诺比率", zhTW: "索提諾比率", en: "Sortino Ratio" },
		DivConsistency: { zh: "收益分散度", zhTW: "收益分散度", en: "PnL Dispersion" },
		TradeDays: { zh: "交易天数", zhTW: "交易天數", en: "Trade Days" },
		TradeCount: { zh: "交易次数", zhTW: "交易次數", en: "Trade Count" },
		ActiveRatio: { zh: "活跃占比", zhTW: "活躍佔比", en: "Active Ratio" },
	};
	const hit = map[featureName];
	if (!hit) return featureName;
	if (locale === "en") return hit.en;
	if (locale === "zh-TW") return hit.zhTW;
	return hit.zh;
}

function fmtCalcTime(calcTime: string | undefined, localeRaw: string): string {
	if (!calcTime) return "—";
	const locale = readLocale(localeRaw);
	const localeTag = locale === "zh-TW" ? "zh-HK" : locale === "en" ? "en-HK" : "zh-CN";
	const d = new Date(calcTime);
	if (Number.isNaN(d.getTime())) return "—";
	return new Intl.DateTimeFormat(localeTag, {
		timeZone: "Asia/Hong_Kong",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(d);
}

export default function TqScoreCard({
	locale,
	tqEnv,
	onEnvChange,
	loading,
	tq,
	tqFeatures,
	updateHint,
}: {
	locale: string;
	tqEnv: TqEnv;
	onEnvChange: (v: TqEnv) => void;
	loading: boolean;
	tq: TqScore | null;
	tqFeatures: TqFeatureItem[];
	updateHint?: string;
}) {
	const copy = readCopy(locale);
	const featureMap = new Map<string, number>();
	for (const item of tqFeatures) featureMap.set(item.featureName, item.normScore);

	const mainAxes = tq
		? [
				{ key: copy.dimensions.riskControl, value: tq.dimensions.riskControl },
				{ key: copy.dimensions.profitability, value: tq.dimensions.profitability },
				{ key: copy.dimensions.consistency, value: tq.dimensions.consistency },
				{ key: copy.dimensions.activeness, value: tq.dimensions.activeness },
			]
		: [];

	const subRadarGroups = FEATURE_GROUPS.map((group) => ({
		id: group.id,
		label: copy.groupTitles[group.id],
		axes: group.features.map((name) => ({
			key: readFeatureLabel(name, locale),
			value: Number(featureMap.get(name) ?? 0),
		})),
	})).filter((group) => group.axes.some((axis) => axis.value > 0));

	const latestCalcTime = tq?.calcTime ?? tqFeatures[0]?.calcTime;

	return (
		<section className="border-border/80 bg-card/45 rounded-2xl border p-4 shadow-[0_0_0_1px_oklch(0.55_0.14_195/0.08)]">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-wide">{copy.title}</p>
					<p className="mt-1 text-3xl font-semibold tabular-nums">{tq ? fmt2(tq.totalScore) : "—"}</p>
					<p className="text-muted-foreground mt-1 text-xs">
						{copy.lastUpdate}：{loading ? "..." : fmtCalcTime(latestCalcTime, locale)}
					</p>
					{updateHint ? <p className="text-muted-foreground mt-1 text-[11px]">{updateHint}</p> : null}
				</div>
				<select
					value={tqEnv}
					onChange={(e) => onEnvChange(e.target.value === "live" ? "live" : "sim")}
					className="bg-background border-border rounded-md border px-2 py-1 text-sm"
				>
					<option value="sim">{copy.envSim}</option>
					<option value="live">{copy.envLive}</option>
				</select>
			</div>

			{tq ? (
				<div className="mt-4 space-y-4">
					<SkillRadarPanel axes={mainAxes} label={copy.mainRadar} tone="teal" />
					<div className="grid gap-3 md:grid-cols-2">
						{subRadarGroups.map((group, idx) => (
							<div key={group.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
								<p className="mb-2 text-sm font-medium">{group.label}</p>
								<SkillRadarPanel
									axes={group.axes}
									label={group.label}
									tone={idx % 3 === 0 ? "violet" : idx % 3 === 1 ? "sky" : "amber"}
									compact
								/>
							</div>
						))}
					</div>
				</div>
			) : (
				<p className="text-muted-foreground mt-3 text-xs">{copy.noData}</p>
			)}
		</section>
	);
}
