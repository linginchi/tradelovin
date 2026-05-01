import { PDFDocument } from "pdf-lib";
import type { MembershipTier } from "@/lib/membership/types";
import type { TqProfileNarrative } from "@/lib/tq/certificate/profile-rules";
import type { TqFeatureSnapshot, TqRadarContract, TqScoreSnapshot } from "@/lib/tq/radar-contract";

export async function renderSvgToImage(svg: string): Promise<Buffer> {
	return Buffer.from(svg, "utf-8");
}

type ReportPdfInput = {
	userId: string;
	tier: MembershipTier;
	environment: "sim" | "live";
	period: "all" | "monthly" | "weekly" | "daily";
	issuedAt: string;
	score: TqScoreSnapshot;
	narrative: TqProfileNarrative;
	radar: TqRadarContract;
	features: TqFeatureSnapshot[];
};

function drawLineList(
	page: ReturnType<PDFDocument["addPage"]>,
	lines: string[],
	x: number,
	yStart: number,
	size = 12,
	step = 18,
) {
	lines.forEach((line, idx) => {
		page.drawText(line, { x, y: yStart - idx * step, size });
	});
}

function groupLines(group: { label: string; axes: Array<{ label: string; score: number; rawValue: number }> }): string[] {
	return [
		`${group.label}`,
		...group.axes.map((axis) => `- ${axis.label}: 分数 ${axis.score.toFixed(2)} | 特征值 ${axis.rawValue.toFixed(2)}`),
	];
}

export async function renderTqReportPdf(input: ReportPdfInput): Promise<Buffer> {
	const pdf = await PDFDocument.create();
	const page1 = pdf.addPage([842, 1191]);
	page1.drawText("TQ交易分析报告 / TQ Trading Behaviour Report", { x: 48, y: 1140, size: 20 });
	page1.drawText(`TQScore: ${input.score.totalScore.toFixed(2)} (${input.narrative.label})`, { x: 48, y: 1106, size: 18 });
	drawLineList(
		page1,
		[
			`用户名 Username: ${input.userId}`,
			`会员等级 Tier: ${input.tier}`,
			`环境 Env: ${input.environment === "live" ? "实盘" : "模拟"} / 周期 Period: ${input.period}`,
			`签发时间 Issued At: ${input.issuedAt}`,
			`盈利能力 Profitability: ${input.score.dimensions.profitability.toFixed(2)}`,
			`风险控制 Risk Control: ${input.score.dimensions.riskControl.toFixed(2)}`,
			`稳定性 Consistency: ${input.score.dimensions.consistency.toFixed(2)}`,
			`活跃度 Activeness: ${input.score.dimensions.activeness.toFixed(2)}`,
		],
		48,
		1066,
		12,
		22,
	);
	page1.drawText("综合评价 Summary", { x: 48, y: 870, size: 16 });
	drawLineList(page1, [input.narrative.summary, ...input.narrative.strengths], 48, 846, 12, 20);

	const page2 = pdf.addPage([842, 1191]);
	page2.drawText("盈利能力 / 风险控制 详细雷达说明", { x: 48, y: 1140, size: 18 });
	const profitability = input.radar.groups.find((group) => group.id === "profitability");
	const riskControl = input.radar.groups.find((group) => group.id === "riskControl");
	if (profitability) drawLineList(page2, groupLines(profitability), 48, 1108, 12, 18);
	if (riskControl) drawLineList(page2, groupLines(riskControl), 48, 860, 12, 18);

	const page3 = pdf.addPage([842, 1191]);
	page3.drawText("活跃程度 / 稳定性 详细雷达说明", { x: 48, y: 1140, size: 18 });
	const activeness = input.radar.groups.find((group) => group.id === "activeness");
	const consistency = input.radar.groups.find((group) => group.id === "consistency");
	if (activeness) drawLineList(page3, groupLines(activeness), 48, 1108, 12, 18);
	if (consistency) drawLineList(page3, groupLines(consistency), 48, 860, 12, 18);

	const page4 = pdf.addPage([842, 1191]);
	page4.drawText("详细图表数据摘要 / Detail Metrics", { x: 48, y: 1140, size: 18 });
	const metricLines = input.features
		.slice(0, 24)
		.map((feature) => `${feature.featureName}: score=${feature.normScore.toFixed(2)}, raw=${feature.rawValue.toFixed(2)}`);
	drawLineList(page4, metricLines, 48, 1108, 11, 16);

	const page5 = pdf.addPage([842, 1191]);
	page5.drawText("个性化建议 / Personalized Suggestions", { x: 48, y: 1140, size: 18 });
	drawLineList(page5, input.narrative.risks.map((risk) => `风险提醒: ${risk}`), 48, 1108, 12, 22);
	drawLineList(page5, input.narrative.suggestions.map((item) => `改进建议: ${item}`), 48, 980, 12, 22);
	drawLineList(
		page5,
		[
			"附注 / Notes:",
			"1) 本报告由 TQ 引擎自动生成，依据当前可用交易数据与归一化规则。",
			"2) 特征值单位以系统定义为准；持仓时长等字段可按秒或天换算展示。",
			"3) 本报告用于交易行为评估，不构成投资建议。",
		],
		48,
		860,
		11,
		20,
	);

	const pdfBytes = await pdf.save();
	return Buffer.from(pdfBytes);
}

