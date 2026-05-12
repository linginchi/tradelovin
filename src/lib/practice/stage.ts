export type PracticeStageKey = "cub" | "young" | "adult" | "expert" | "legend";

export type PracticeStage = {
	key: PracticeStageKey;
	title: string;
	description: string;
	icon: string;
};

type StageRule = {
	stage: PracticeStage;
	meets: (totalScore: number, completedCount: number) => boolean;
};

export const PRACTICE_STAGES: PracticeStage[] = [
	{ key: "cub", title: "初生幼豹", description: "初入练习场，稳扎稳打。", icon: "🐆" },
	{ key: "young", title: "青年豹", description: "锐意进取，动作渐稳。", icon: "🐆" },
	{ key: "adult", title: "壮年豹", description: "独当一面，节奏成熟。", icon: "🐆" },
	{ key: "expert", title: "经验老豹", description: "炉火纯青，攻守自如。", icon: "🐆" },
	{ key: "legend", title: "传奇豹尊", description: "万中无一，豹中之王。", icon: "👑" },
];

const STAGE_RULES: StageRule[] = [
	{
		stage: PRACTICE_STAGES[4],
		meets: (totalScore, completedCount) => completedCount >= 6 && totalScore >= 300,
	},
	{
		stage: PRACTICE_STAGES[3],
		meets: (totalScore, completedCount) => completedCount >= 6 || totalScore >= 150,
	},
	{
		stage: PRACTICE_STAGES[2],
		meets: (totalScore, completedCount) => completedCount >= 4 || totalScore >= 80,
	},
	{
		stage: PRACTICE_STAGES[1],
		meets: (totalScore, completedCount) => completedCount >= 2 || totalScore >= 30,
	},
	{
		stage: PRACTICE_STAGES[0],
		meets: () => true,
	},
];

export function getStageByKey(key: string | null | undefined): PracticeStage {
	return PRACTICE_STAGES.find((stage) => stage.key === key) ?? PRACTICE_STAGES[0];
}

export function stageRank(key: string | null | undefined): number {
	const idx = PRACTICE_STAGES.findIndex((stage) => stage.key === key);
	return idx >= 0 ? idx : 0;
}

export function getUserStage(totalScore: number, completedCount: number): PracticeStage {
	return STAGE_RULES.find((rule) => rule.meets(totalScore, completedCount))?.stage ?? PRACTICE_STAGES[0];
}

export function getNextStage(currentStageKey: PracticeStageKey): PracticeStage | null {
	const idx = PRACTICE_STAGES.findIndex((stage) => stage.key === currentStageKey);
	if (idx < 0 || idx >= PRACTICE_STAGES.length - 1) return null;
	return PRACTICE_STAGES[idx + 1];
}

export function getStageRequirementHint(next: PracticeStage, totalScore: number, completedCount: number): string {
	if (next.key === "young") {
		return `再完成 ${Math.max(0, 2 - completedCount)} 个关卡或再得 ${Math.max(0, 30 - totalScore)} 分`;
	}
	if (next.key === "adult") {
		return `再完成 ${Math.max(0, 4 - completedCount)} 个关卡或再得 ${Math.max(0, 80 - totalScore)} 分`;
	}
	if (next.key === "expert") {
		return `再完成 ${Math.max(0, 6 - completedCount)} 个关卡或再得 ${Math.max(0, 150 - totalScore)} 分`;
	}
	return `还需完成全部 6 关且再得 ${Math.max(0, 300 - totalScore)} 分`;
}
