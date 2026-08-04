import assert from "node:assert/strict";
import test from "node:test";

import { filterLabReport } from "@/lib/lab/compliance-filter";
import {
	evaluateGateE,
	formatSpikeSummaryForOutput,
	getMissingSpikeEnvVars,
	runSpikeLabCheck,
	validateAndSanitizeLabBaseUrl,
	validateHealthModelsPayload,
	validateSpikeReportCompliance,
} from "@/lib/lab/spike-check";

const compliantReport = {
	version: "lab-diagnose-v1",
	summary: "组合行业集中度偏高，防御性暴露不足。",
	riskThemes: ["行业集中"],
	sectorExposure: [{ sector: "科技", weightNote: "占比偏高" }],
	concentrationNotes: ["单一主题暴露偏大"],
	teachingQuestions: ["若该主题回撤，你的计划是什么？"],
	disclaimer: "本报告仅供学习训练，不构成投资建议；不荐股、无实盘。",
};

const validHealthBody = {
	providers: [
		{ id: "gemini", configured: true, visionCapable: true, models: ["gemini-2.0-flash"] },
		{
			id: "glm",
			configured: false,
			visionCapable: false,
			models: [],
			reason: "ZHIPU_API_KEY missing",
		},
	],
};

function geminiGlmHealth(gemini: Record<string, unknown>, glm: Record<string, unknown>) {
	return {
		providers: [
			{ id: "gemini", models: [], ...gemini },
			{ id: "glm", models: [], ...glm },
		],
	};
}

test("spike runner fail closed when required env vars are missing", async () => {
	const missing = getMissingSpikeEnvVars({});
	assert.deepEqual(missing, ["LAB_PUBLIC_BASE_URL", "LAB_DOJO_SERVER_KEY"]);

	let fetchCalled = false;
	const { exitCode, summary } = await runSpikeLabCheck({
		env: {},
		fetchImpl: async () => {
			fetchCalled = true;
			return new Response("{}");
		},
	});
	assert.equal(fetchCalled, false);
	assert.equal(exitCode, 1);
	assert.equal(summary.executionStatus, "blocked_missing_env");
	assert.match(summary.note, /未发起外部请求/);
});

test("non-compliant reports are rejected by main site compliance filter", () => {
	assert.equal(validateSpikeReportCompliance(compliantReport).ok, true);
	assert.equal(validateSpikeReportCompliance({ ...compliantReport, summary: "建议买入" }).ok, false);
	assert.equal(filterLabReport({ ...compliantReport, summary: "建议买入" }).ok, false);
});

test("health payload missing fields cannot pass Gate E", () => {
	const shapeFail = validateHealthModelsPayload({ providers: [{ id: "gemini" }] });
	assert.equal(shapeFail.ok, false);

	const geminiOff = validateHealthModelsPayload(
		geminiGlmHealth({ configured: false, visionCapable: false }, { configured: false, visionCapable: false }),
	);
	assert(geminiOff.ok);
	assert.equal(evaluateGateE(geminiOff.providers).pass, false);

	const noVision = validateHealthModelsPayload(
		geminiGlmHealth(
			{ configured: true, visionCapable: false, models: ["gemini-2.0-flash"] },
			{ configured: false, visionCapable: false },
		),
	);
	assert(noVision.ok);
	assert.equal(evaluateGateE(noVision.providers).pass, false);

	const valid = validateHealthModelsPayload(validHealthBody);
	assert(valid.ok);
	assert.equal(evaluateGateE(valid.providers).pass, true);
});

test("Gate E passes when GLM is configured with visionCapable=true", () => {
	const body = validateHealthModelsPayload(
		geminiGlmHealth(
			{ configured: true, visionCapable: true, models: ["gemini-2.0-flash"] },
			{ configured: true, visionCapable: true, models: ["glm-4v"] },
		),
	);
	assert(body.ok);
	const gateE = evaluateGateE(body.providers);
	assert.equal(gateE.pass, true);
	assert.equal(gateE.glm.pass, true);
});

test("Gate E fails when GLM is configured but visionCapable=false", () => {
	const body = validateHealthModelsPayload(
		geminiGlmHealth(
			{ configured: true, visionCapable: true, models: ["gemini-2.0-flash"] },
			{ configured: true, visionCapable: false, models: ["glm-4"] },
		),
	);
	assert(body.ok);
	const gateE = evaluateGateE(body.providers);
	assert.equal(gateE.pass, false);
	assert.equal(gateE.glm.pass, false);
	assert.match(String(gateE.glm.reason), /visionCapable=false/);
});

test("invalid lab base URL fails closed without echoing sensitive parts", async () => {
	const sensitiveQuery = "secretToken=must-not-appear";
	const sensitiveFragment = "jwt-must-not-appear";
	const sensitiveCred = "labuser:labpass";

	for (const raw of [
		`https://lab.example.invalid?${sensitiveQuery}`,
		`https://lab.example.invalid#${sensitiveFragment}`,
		`https://${sensitiveCred}@lab.example.invalid`,
	]) {
		const validation = validateAndSanitizeLabBaseUrl(raw);
		assert.equal(validation.ok, false);

		let fetchCalled = false;
		const { exitCode, summary } = await runSpikeLabCheck({
			env: {
				LAB_PUBLIC_BASE_URL: raw,
				LAB_DOJO_SERVER_KEY: "test-key",
			},
			fetchImpl: async () => {
				fetchCalled = true;
				return new Response("{}");
			},
		});
		assert.equal(fetchCalled, false);
		assert.equal(exitCode, 1);
		assert.equal(summary.executionStatus, "blocked_invalid_base_url");
		assert.equal(summary.errorCategory, "invalid_lab_base_url");
		const output = formatSpikeSummaryForOutput(summary);
		assert(!output.includes(sensitiveQuery));
		assert(!output.includes(sensitiveFragment));
		assert(!output.includes(sensitiveCred));
		assert(!output.includes(raw));
	}
});

test("fetch failures emit sanitized summary without secrets from error or env", async () => {
	const sensitive = "SUPER_SECRET_DOJO_KEY_98765";
	const { exitCode, summary } = await runSpikeLabCheck({
		env: {
			LAB_PUBLIC_BASE_URL: "https://lab.example.invalid",
			LAB_DOJO_SERVER_KEY: sensitive,
		},
		fetchImpl: async () => {
			throw new Error(`connection failed: ${sensitive} at https://lab.example.invalid/health/models`);
		},
	});
	assert.equal(exitCode, 1);
	assert.equal(summary.executionStatus, "blocked_fetch_error");
	assert.equal(summary.errorCategory, "health_request_failed");
	assert.match(summary.note, /health_request_failed/);

	const output = formatSpikeSummaryForOutput(summary);
	assert(!output.includes(sensitive));
	assert(!output.includes("connection failed"));
});

test("runSpikeLabCheck marks gate_e_fail and suggestFallback when gemini not ready", async () => {
	const { exitCode, summary } = await runSpikeLabCheck({
		env: {
			LAB_PUBLIC_BASE_URL: "https://lab.example.invalid",
			LAB_DOJO_SERVER_KEY: "test-key",
		},
		fetchImpl: async () =>
			new Response(
				JSON.stringify(
					geminiGlmHealth({ configured: false, visionCapable: false }, { configured: false, visionCapable: false }),
				),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
	});
	assert.equal(exitCode, 1);
	assert.equal(summary.executionStatus, "gate_e_fail");
	assert.equal(summary.suggestFallback, true);
	assert.match(summary.note, /建议 fallback/);
});
