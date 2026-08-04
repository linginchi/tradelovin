import { z } from "zod";

/** 用户可见的去标的化组合诊断报告（不含股票代码/名称/买卖指令） */
export const labDiagnoseReportSchema = z.object({
	version: z.literal("lab-diagnose-v1").default("lab-diagnose-v1"),
	summary: z.string().min(1).max(2000),
	riskThemes: z.array(z.string().min(1).max(200)).max(12),
	sectorExposure: z
		.array(
			z.object({
				sector: z.string().min(1).max(80),
				weightNote: z.string().min(1).max(200),
			}),
		)
		.max(20),
	concentrationNotes: z.array(z.string().min(1).max(300)).max(12),
	teachingQuestions: z.array(z.string().min(1).max(300)).max(8),
	disclaimer: z
		.string()
		.min(1)
		.max(500)
		.default("本报告仅供学习训练，不构成投资建议；不荐股、无实盘。"),
});

export type LabDiagnoseReport = z.infer<typeof labDiagnoseReportSchema>;

export function parseLabDiagnoseReport(input: unknown):
	| { ok: true; report: LabDiagnoseReport }
	| { ok: false; reason: string } {
	const parsed = labDiagnoseReportSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, reason: parsed.error.issues.map((i) => i.message).join("; ") };
	}
	if (input && typeof input === "object") {
		const obj = input as Record<string, unknown>;
		if ("symbols" in obj || "tickers" in obj || "orders" in obj) {
			return { ok: false, reason: "报告不得包含 symbols/tickers/orders 字段" };
		}
	}
	return { ok: true, report: parsed.data };
}
