import assert from "node:assert/strict";
import test from "node:test";

import { buildAssessmentDashboard } from "@/lib/assessment/build-dashboard";
import type { AssessmentScoreSnapshot } from "@/lib/assessment/types";

const coldScore: AssessmentScoreSnapshot = {
	total: 0,
	eligible: false,
	tradeCount: 3,
	minTrades: 10,
	dimensions: { profitability: 0, riskControl: 0, consistency: 0, activeness: 0 },
};

const scored: AssessmentScoreSnapshot = {
	total: 62.4,
	eligible: true,
	tradeCount: 18,
	minTrades: 10,
	dimensions: { profitability: 40, riskControl: 80, consistency: 55, activeness: 70 },
};

const paidAdvice = {
	key: "risk-over-pnl",
	title: "付费风控课",
	text: "仅会员可见的建议正文",
	courseHint: "/courses/risk",
};

test("T0 cold start lists where to begin and never looks empty", () => {
	const view = buildAssessmentDashboard({
		module: "t0",
		score: coldScore,
		adviceLocked: true,
		advice: [paidAdvice],
		nextPlan: "T1",
		labAccess: false,
		labSessions: [],
	});
	assert.equal(view.mode, "cold-start");
	assert.equal(view.lab, null);
	assert.ok(view.nextSteps.length >= 2);
	assert.ok(view.nextSteps.some((step) => step.id === "practice"));
	assert.equal(view.nextSteps.find((step) => step.id === "practice")?.href, "/trade#panel-symbol-input");
	assert.match(view.nextSteps.find((step) => step.id === "quota")?.reason ?? "", /3\/10/);
	assert.equal(view.nextSteps.some((step) => step.reason.includes("仅会员可见")), false);
});

test("T0 scored highlights the two weakest dimensions", () => {
	const view = buildAssessmentDashboard({
		module: "t0",
		score: scored,
		adviceLocked: false,
		advice: [paidAdvice],
		nextPlan: "T2",
		labAccess: true,
		labSessions: [],
	});
	assert.equal(view.mode, "scored");
	assert.ok(view.nextSteps.some((step) => step.id === "strengthen-profitability"));
	assert.ok(view.nextSteps.some((step) => step.id === "strengthen-consistency"));
	assert.ok(view.nextSteps.some((step) => step.id === "advice-risk-over-pnl"));
	assert.equal(view.nextSteps.find((step) => step.id === "advice-risk-over-pnl")?.href, "/courses/risk");
});

test("locked advice does not leak paid copy into next steps", () => {
	const view = buildAssessmentDashboard({
		module: "t0",
		score: scored,
		adviceLocked: true,
		advice: [paidAdvice],
		nextPlan: null,
		labAccess: false,
		labSessions: [],
	});
	assert.equal(view.adviceLocked, true);
	assert.equal(
		view.nextSteps.some((step) => step.id.startsWith("advice-") || step.reason.includes("仅会员可见")),
		false,
	);
});

test("lab without access cold-starts to membership", () => {
	const view = buildAssessmentDashboard({
		module: "lab",
		score: scored,
		adviceLocked: true,
		advice: [],
		nextPlan: "T2",
		labAccess: false,
		labSessions: [],
	});
	assert.equal(view.mode, "cold-start");
	assert.equal(view.lab?.access, false);
	assert.equal(view.nextSteps[0]?.href, "/membership");
});

test("lab with access but no sessions asks for the first diagnose", () => {
	const view = buildAssessmentDashboard({
		module: "lab",
		score: scored,
		adviceLocked: false,
		advice: [],
		nextPlan: null,
		labAccess: true,
		labSessions: [],
	});
	assert.equal(view.mode, "cold-start");
	assert.equal(view.score.total, 62.4);
	assert.ok(view.nextSteps.some((step) => step.id === "first-diagnose"));
});

test("lab with sessions stays scored even when TQ is still cold-start", () => {
	const view = buildAssessmentDashboard({
		module: "lab",
		score: coldScore,
		adviceLocked: false,
		advice: [],
		nextPlan: null,
		labAccess: true,
		labSessions: [{ riskThemes: ["行业集中度偏高"] }],
	});
	assert.equal(view.mode, "scored");
	assert.equal(view.score.eligible, false);
	assert.equal(view.lab?.sessionCount, 1);
	assert.ok(view.nextSteps.some((step) => step.reason === "行业集中度偏高"));
});

test("lab with sessions turns risk themes into training hints", () => {
	const view = buildAssessmentDashboard({
		module: "lab",
		score: scored,
		adviceLocked: false,
		advice: [paidAdvice],
		nextPlan: null,
		labAccess: true,
		labSessions: [
			{ riskThemes: ["行业集中度偏高", "配置结构待优化"] },
			{ riskThemes: ["行业集中度偏高"] },
		],
	});
	assert.equal(view.mode, "scored");
	assert.equal(view.lab?.sessionCount, 2);
	assert.deepEqual(view.lab?.riskThemes, ["行业集中度偏高", "配置结构待优化"]);
	assert.ok(view.nextSteps.some((step) => step.id === "again"));
	assert.ok(view.nextSteps.some((step) => step.reason === "行业集中度偏高"));
	assert.equal(view.nextSteps.some((step) => step.id.startsWith("advice-")), false);
});
