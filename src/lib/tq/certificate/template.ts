import type { MembershipTier } from "@/lib/membership/types";
import type { TqProfileNarrative } from "@/lib/tq/certificate/profile-rules";
import type { TqRadarContract } from "@/lib/tq/radar-contract";

type CertificateTemplateInput = {
	userId: string;
	tier: MembershipTier;
	environment: "sim" | "live";
	period: "all" | "monthly" | "weekly" | "daily";
	issuedAt: string;
	totalScore: number;
	radar: TqRadarContract;
	narrative: TqProfileNarrative;
	info: {
		username: string;
		market: string;
		roiText: string;
		tradeLifeText: string;
		biggestLossText: string;
		avgDurationText: string;
	};
};

function escapeXml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function toPoints(cx: number, cy: number, radius: number, values: number[]): string {
	const n = Math.max(3, values.length);
	const pts: string[] = [];
	for (let i = 0; i < n; i += 1) {
		const angle = -Math.PI / 2 + (Math.PI * 2 * i) / n;
		const r = radius * Math.max(0, Math.min(100, values[i] ?? 0)) / 100;
		const x = cx + Math.cos(angle) * r;
		const y = cy + Math.sin(angle) * r;
		pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
	}
	return pts.join(" ");
}

function radarSvg(
	cx: number,
	cy: number,
	radius: number,
	label: string,
	axes: Array<{ label: string; score: number }>,
	color: string,
): string {
	const values = axes.map((axis) => axis.score);
	const polygon = toPoints(cx, cy, radius, values);
	const labels = axes
		.slice(0, 8)
		.map((axis, idx) => {
			const angle = -Math.PI / 2 + (Math.PI * 2 * idx) / Math.max(3, axes.length);
			const x = cx + Math.cos(angle) * (radius + 24);
			const y = cy + Math.sin(angle) * (radius + 24);
			return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="13" text-anchor="middle" fill="#CBD5E1">${escapeXml(axis.label)}</text>`;
		})
		.join("");
	return `
<g>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#334155" stroke-width="1" />
  <circle cx="${cx}" cy="${cy}" r="${(radius * 0.66).toFixed(1)}" fill="none" stroke="#1F2937" stroke-width="1" />
  <circle cx="${cx}" cy="${cy}" r="${(radius * 0.33).toFixed(1)}" fill="none" stroke="#1F2937" stroke-width="1" />
  <polygon points="${polygon}" fill="${color}" fill-opacity="0.32" stroke="${color}" stroke-width="2" />
  <text x="${cx}" y="${(cy + radius + 46).toFixed(1)}" font-size="16" text-anchor="middle" fill="#E2E8F0">${escapeXml(label)}</text>
  ${labels}
</g>`;
}

function tierTitle(tier: MembershipTier): string {
	if (tier === "T1") return "P1 · 雪豹";
	if (tier === "T2") return "P2 · 云豹";
	return "P3 · 金钱豹";
}

export function buildCertificateSvg(input: CertificateTemplateInput): string {
	const core = input.radar.groups.find((group) => group.id === "core");
	const profitability = input.radar.groups.find((group) => group.id === "profitability");
	const riskControl = input.radar.groups.find((group) => group.id === "riskControl");
	const activeness = input.radar.groups.find((group) => group.id === "activeness");
	const consistency = input.radar.groups.find((group) => group.id === "consistency");
	const summary = escapeXml(input.narrative.summary);
	const strengths = input.narrative.strengths.map((x) => `<tspan x="80" dy="28">- ${escapeXml(x)}</tspan>`).join("");
	const risks = input.narrative.risks.map((x) => `<tspan x="80" dy="28">- ${escapeXml(x)}</tspan>`).join("");
	const suggestions = input.narrative.suggestions
		.map((x) => `<tspan x="80" dy="28">- ${escapeXml(x)}</tspan>`)
		.join("");
	const periodMap: Record<CertificateTemplateInput["period"], string> = {
		all: "全历史",
		monthly: "近30天",
		weekly: "近7天",
		daily: "近1天",
	};

	const groupRadars =
		input.tier === "T1"
			? ""
			: `
${profitability ? radarSvg(300, 760, 120, profitability.label, profitability.axes, "#60A5FA") : ""}
${riskControl ? radarSvg(920, 760, 120, riskControl.label, riskControl.axes, "#F59E0B") : ""}
${activeness ? radarSvg(300, 1080, 120, activeness.label, activeness.axes, "#C084FC") : ""}
${consistency ? radarSvg(920, 1080, 120, consistency.label, consistency.axes, "#34D399") : ""}
`;

	const featureSection =
		input.tier === "T3"
			? `
<text x="80" y="1320" font-size="22" fill="#F8FAFC">特征解释与进阶建议</text>
<text x="80" y="1360" font-size="17" fill="#E2E8F0">${suggestions}</text>
`
			: "";

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#F8FAFC" />
  <rect x="32" y="32" width="1176" height="1690" rx="14" fill="#FFFFFF" stroke="#E2E8F0" />

  <text x="72" y="96" font-size="30" fill="#0F172A">TQ交易分析报告</text>
  <text x="72" y="128" font-size="22" fill="#334155">TQ Trading Behaviour Report</text>
  <text x="72" y="176" font-size="58" fill="#0F172A" font-weight="700">${input.totalScore.toFixed(2)}</text>
  <text x="250" y="174" font-size="26" fill="#0F172A">${escapeXml(input.narrative.label)}</text>
  <text x="72" y="208" font-size="15" fill="#475569">此报告最后更新于 ${escapeXml(input.issuedAt.slice(0, 10))}</text>

  <text x="72" y="258" font-size="17" fill="#0F172A">基本信息 Information</text>
  <text x="72" y="286" font-size="15" fill="#334155">用户名 Username: ${escapeXml(input.info.username)}</text>
  <text x="72" y="312" font-size="15" fill="#334155">交易品种 Market: ${escapeXml(input.info.market)}</text>
  <text x="72" y="338" font-size="15" fill="#334155">投资回报率 ROI: ${escapeXml(input.info.roiText)}</text>
  <text x="72" y="364" font-size="15" fill="#334155">交易历史 Trade Life: ${escapeXml(input.info.tradeLifeText)}</text>
  <text x="72" y="390" font-size="15" fill="#334155">最大损失 Biggest Loss: ${escapeXml(input.info.biggestLossText)}</text>
  <text x="72" y="416" font-size="15" fill="#334155">平均持仓时间 Avg of Durations: ${escapeXml(input.info.avgDurationText)}</text>
  <text x="72" y="450" font-size="14" fill="#334155">TQ评级 ${escapeXml(input.narrative.label)} · ${escapeXml(tierTitle(input.tier))}</text>
  <text x="72" y="474" font-size="14" fill="#334155">环境 ${input.environment === "live" ? "实盘" : "模拟"} · 周期 ${periodMap[input.period]}</text>

  ${core ? radarSvg(920, 328, 130, "TQScore", core.axes, "#14B8A6") : ""}

  <text x="72" y="548" font-size="20" fill="#0F172A">综合评价 / Summary</text>
  <text x="72" y="578" font-size="16" fill="#334155">${summary}</text>
  <text x="72" y="618" font-size="16" fill="#334155">${strengths}</text>
  <text x="640" y="618" font-size="16" fill="#334155">${risks}</text>

  ${groupRadars}
  ${featureSection}

  <line x1="72" y1="1560" x2="1168" y2="1560" stroke="#E2E8F0" />
  <text x="72" y="1600" font-size="16" fill="#0F172A">马蔚华 先生</text>
  <text x="72" y="1624" font-size="14" fill="#475569">TQ金融创新工场总导师</text>
  <text x="520" y="1600" font-size="16" fill="#0F172A">金含清 教授</text>
  <text x="520" y="1624" font-size="14" fill="#475569">牛津大学NIE金融大数据实验室主任</text>
  <text x="72" y="1680" font-size="12" fill="#64748B">1. 各交易品种初始资金规则可在报告附录查看。2. 持仓时间单位为秒。</text>
</svg>`;
}

