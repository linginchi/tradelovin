import type {
	AssessmentAdviceItem,
	AssessmentDashboardView,
	AssessmentDimensionId,
	AssessmentLabSnapshot,
	AssessmentModule,
	AssessmentNextStep,
	AssessmentScoreSnapshot,
} from "@/lib/assessment/types";
import { ASSESSMENT_DIMENSION_ORDER } from "@/lib/assessment/types";

const DIMENSION_LABEL: Record<AssessmentDimensionId, string> = {
	profitability: "盈利能力",
	riskControl: "风控能力",
	consistency: "稳定性",
	activeness: "活跃度",
};

const DIMENSION_REASON: Record<AssessmentDimensionId, string> = {
	profitability: "这一维偏低时，先在考核盘把盈亏复盘做完整，再追求更高分数。",
	riskControl: "这一维偏低时，先控制单笔仓位与回撤，而不是加交易次数。",
	consistency: "这一维偏低时，保持稳定节奏，避免忽多忽少。",
	activeness: "这一维偏低时，先凑够本月有效成交笔数，仪表才能打分。",
};

export type BuildAssessmentDashboardInput = {
	module: AssessmentModule;
	score: AssessmentScoreSnapshot;
	adviceLocked: boolean;
	advice: AssessmentAdviceItem[];
	nextPlan: "T1" | "T2" | "T3" | null;
	labAccess: boolean;
	labSessions: Array<{ riskThemes: string[] }>;
};

function uniqueSteps(steps: AssessmentNextStep[]): AssessmentNextStep[] {
	const seen = new Set<string>();
	const out: AssessmentNextStep[] = [];
	for (const step of steps) {
		if (seen.has(step.id)) continue;
		seen.add(step.id);
		out.push(step);
	}
	return out.slice(0, 6);
}

function weakestDimensions(score: AssessmentScoreSnapshot, count: number): AssessmentDimensionId[] {
	return [...ASSESSMENT_DIMENSION_ORDER]
		.sort((a, b) => score.dimensions[a] - score.dimensions[b] || ASSESSMENT_DIMENSION_ORDER.indexOf(a) - ASSESSMENT_DIMENSION_ORDER.indexOf(b))
		.slice(0, count);
}

function collectRiskThemes(sessions: Array<{ riskThemes: string[] }>): string[] {
	const seen = new Set<string>();
	const themes: string[] = [];
	for (const session of sessions) {
		for (const theme of session.riskThemes) {
			const text = theme.trim();
			if (!text || seen.has(text)) continue;
			seen.add(text);
			themes.push(text);
			if (themes.length >= 3) return themes;
		}
	}
	return themes;
}

function courseHref(hint: string | null, fallback: string): string {
	if (hint && hint.startsWith("/") && !hint.startsWith("//")) return hint;
	return fallback;
}

function t0ColdStart(score: AssessmentScoreSnapshot, nextPlan: "T1" | "T2" | "T3" | null): AssessmentNextStep[] {
	const steps: AssessmentNextStep[] = [
		{
			id: "practice",
			title: "从操作练习开始",
			href: "/trade#panel-symbol-input",
			reason: "先在考核盘输入标的、看行情、完成模拟成交，仪表才有数据。",
		},
		{
			id: "quota",
			title: "凑够本月有效成交",
			href: "/trade",
			reason: `当前 ${score.tradeCount}/${score.minTrades} 笔。满 ${score.minTrades} 笔后才会生成有效 TQ。`,
		},
	];
	if (nextPlan) {
		steps.push({
			id: "upgrade",
			title: `查看升级到 ${nextPlan}`,
			href: "/membership",
			reason: "成交与分数达标后可在会员中心核对下一档门槛。",
		});
	}
	return uniqueSteps(steps);
}

function t0Scored(
	score: AssessmentScoreSnapshot,
	adviceLocked: boolean,
	advice: AssessmentAdviceItem[],
	nextPlan: "T1" | "T2" | "T3" | null,
): AssessmentNextStep[] {
	const steps: AssessmentNextStep[] = weakestDimensions(score, 2).map((id) => ({
		id: `strengthen-${id}`,
		title: `加强${DIMENSION_LABEL[id]}`,
		href: "/trade",
		reason: DIMENSION_REASON[id],
	}));
	if (!adviceLocked) {
		for (const item of advice.slice(0, 3)) {
			steps.push({
				id: `advice-${item.key}`,
				title: item.title,
				href: courseHref(item.courseHint, "/trade"),
				reason: item.text,
			});
		}
	}
	if (nextPlan) {
		steps.push({
			id: "upgrade",
			title: `查看升级到 ${nextPlan}`,
			href: "/membership",
			reason: "用本月 TQ 对照下一档会员门槛，不改变现在的训练任务。",
		});
	}
	return uniqueSteps(steps);
}

function labSteps(input: {
	labAccess: boolean;
	sessionCount: number;
	riskThemes: string[];
}): AssessmentNextStep[] {
	if (!input.labAccess) {
		return uniqueSteps([
			{
				id: "upgrade",
				title: "升级到云豹后进入实验室",
				href: "/membership",
				reason: "组合诊断需 P2 · 云豹及以上。先完成准入，再上传教学截图。",
			},
		]);
	}
	if (input.sessionCount === 0) {
		return uniqueSteps([
			{
				id: "first-diagnose",
				title: "做第一次组合诊断",
				href: "/lab",
				reason: "从主站进入实验室，上传匿名教学截图，得到去标的化风险结构。",
			},
		]);
	}
	const steps: AssessmentNextStep[] = [
		{
			id: "again",
			title: "再做一次组合诊断",
			href: "/lab",
			reason: "用另一张教学截图对照行业暴露与集中度，不要寻找买卖指令。",
		},
	];
	input.riskThemes.forEach((theme, index) => {
		steps.push({
			id: `theme-${index}`,
			title: "复盘这条风险主题",
			href: "/lab",
			reason: theme,
		});
	});
	return uniqueSteps(steps);
}

export function buildAssessmentDashboard(input: BuildAssessmentDashboardInput): AssessmentDashboardView {
	const lab: AssessmentLabSnapshot | null =
		input.module === "lab"
			? {
					access: input.labAccess,
					sessionCount: input.labSessions.length,
					riskThemes: collectRiskThemes(input.labSessions),
				}
			: null;

	const labCold =
		input.module === "lab" && (!input.labAccess || (lab?.sessionCount ?? 0) === 0);
	const mode: AssessmentDashboardView["mode"] =
		input.module === "t0"
			? input.score.eligible
				? "scored"
				: "cold-start"
			: labCold
				? "cold-start"
				: "scored";

	const nextSteps =
		input.module === "t0"
			? mode === "cold-start"
				? t0ColdStart(input.score, input.nextPlan)
				: t0Scored(input.score, input.adviceLocked, input.advice, input.nextPlan)
			: labSteps({
					labAccess: input.labAccess,
					sessionCount: lab?.sessionCount ?? 0,
					riskThemes: lab?.riskThemes ?? [],
				});

	return {
		module: input.module,
		title: input.module === "t0" ? "T0 考核仪表" : "实验室考核仪表",
		mode,
		adviceLocked: input.adviceLocked,
		score: input.score,
		nextSteps,
		lab,
	};
}
