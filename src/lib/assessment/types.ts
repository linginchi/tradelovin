export type AssessmentModule = "t0" | "lab";

export type AssessmentDimensionId =
	| "profitability"
	| "riskControl"
	| "consistency"
	| "activeness";

export type AssessmentNextStep = {
	id: string;
	title: string;
	href: string;
	reason: string;
};

export type AssessmentAdviceItem = {
	key: string;
	title: string;
	text: string;
	courseHint: string | null;
};

export type AssessmentScoreSnapshot = {
	total: number;
	eligible: boolean;
	tradeCount: number;
	minTrades: number;
	dimensions: Record<AssessmentDimensionId, number>;
};

export type AssessmentLabSnapshot = {
	access: boolean;
	sessionCount: number;
	riskThemes: string[];
};

export type AssessmentDashboardView = {
	module: AssessmentModule;
	title: string;
	mode: "cold-start" | "scored";
	adviceLocked: boolean;
	score: AssessmentScoreSnapshot;
	nextSteps: AssessmentNextStep[];
	lab: AssessmentLabSnapshot | null;
};

export const ASSESSMENT_DIMENSION_ORDER: AssessmentDimensionId[] = [
	"profitability",
	"riskControl",
	"consistency",
	"activeness",
];
