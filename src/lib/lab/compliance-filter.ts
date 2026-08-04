import {
	parseLabDiagnoseReport,
	type LabDiagnoseReport,
} from "@/lib/lab/report-schema";

/** 买卖/荐股类指令词（中英） */
const ORDER_HINT_RE =
	/(买入|卖出|加仓|减仓|建仓|清仓|做多|做空|推荐买入|建议买入|建议卖出|\bbuy\b|\bsell\b|\blong\b|\bshort\b)/i;

/** 明显证券代码：A股 6 位、港股 5 位数字；以及「代码/ticker」后紧跟代码 */
const TICKER_RE =
	/(?:^|[^\d])\d{6}(?:[^\d]|$)|(?:^|[^\d])\d{5}(?:[^\d]|$)|(?:代码|代号|ticker|symbol)\s*[:：]?\s*[A-Za-z0-9.\-]{1,8}/i;

/** 用户可见诊断不得包含常见个人联系方式。 */
const PII_RE =
	/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:^|[^\d])(?:\+?86[-\s]?)?1[3-9]\d{9}(?:[^\d]|$)/i;

function collectText(report: LabDiagnoseReport): string {
	const parts = [
		report.summary,
		report.disclaimer,
		...report.riskThemes,
		...report.concentrationNotes,
		...report.teachingQuestions,
		...report.sectorExposure.map((s) => `${s.sector} ${s.weightNote}`),
	];
	return parts.join("\n");
}

export type LabFilterResult =
	| { ok: true; report: LabDiagnoseReport }
	| { ok: false; reason: string };

/**
 * Schema 校验 + 规则过滤。命中荐股/代码模式则拒绝落库与展示。
 * 语义层审核可在后续接 LLM 二次检查；此处为最终门禁之一。
 */
export function filterLabReport(input: unknown): LabFilterResult {
	const parsed = parseLabDiagnoseReport(input);
	if (!parsed.ok) return parsed;

	const text = collectText(parsed.report);
	if (ORDER_HINT_RE.test(text)) {
		return { ok: false, reason: "报告含买卖/荐股指令用语，已拦截" };
	}
	if (TICKER_RE.test(text)) {
		return { ok: false, reason: "报告疑似含证券代码，已拦截（须去标的化）" };
	}
	if (PII_RE.test(text)) {
		return { ok: false, reason: "报告含个人联系方式，已拦截" };
	}
	return { ok: true, report: parsed.report };
}
