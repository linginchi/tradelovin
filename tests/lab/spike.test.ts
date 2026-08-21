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
	providers: [{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] }],
};

function volcanoHealth(volcano: Record<string, unknown>) {
	return {
		providers: [{ id: "volcano", models: [], ...volcano }],
	};
}

/** Test-only: partial env bags are intentional; ProcessEnv requires NODE_ENV. */
function asProcessEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return env as unknown as NodeJS.ProcessEnv;
}

test("spike runner fail closed when required env vars are missing", async () => {
	const missing = getMissingSpikeEnvVars(asProcessEnv({}));
	assert.deepEqual(missing, ["LAB_PUBLIC_BASE_URL", "LAB_DOJO_SERVER_KEY"]);

	let fetchCalled = false;
	const { exitCode, summary } = await runSpikeLabCheck({
		env: asProcessEnv({}),
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

test("health payload missing volcano fails shape", () => {
	const missingFields = validateHealthModelsPayload({ providers: [{ id: "volcano" }] });
	assert.equal(missingFields.ok, false);

	const volcanoMissing = validateHealthModelsPayload({
		providers: [{ id: "gemini", configured: true, visionCapable: true, models: ["gemini-2.0-flash"] }],
	});
	assert.equal(volcanoMissing.ok, false);
	assert.match(volcanoMissing.ok ? "" : volcanoMissing.details.join(" "), /volcano/);
});

test("volcano not configured fails Gate E", () => {
	const body = validateHealthModelsPayload(
		volcanoHealth({ configured: false, visionCapable: false }),
	);
	assert(body.ok);
	const gateE = evaluateGateE(body.providers);
	assert.equal(gateE.pass, false);
	assert.equal(gateE.volcano.pass, false);
	assert.equal(gateE.volcano.configured, false);

	const noVision = validateHealthModelsPayload(
		volcanoHealth({ configured: true, visionCapable: false, models: ["pending-spike"] }),
	);
	assert(noVision.ok);
	assert.equal(evaluateGateE(noVision.providers).pass, false);
});

test("volcano configured with visionCapable passes Gate E", () => {
	const valid = validateHealthModelsPayload(validHealthBody);
	assert(valid.ok);
	const gateE = evaluateGateE(valid.providers);
	assert.equal(gateE.pass, true);
	assert.equal(gateE.volcano.pass, true);
	assert.equal(gateE.volcano.configured, true);
	assert.equal(gateE.volcano.visionCapable, true);
});

test("extra gemini id is ignored in health payload", () => {
	const body = validateHealthModelsPayload({
		providers: [
			{ id: "gemini", configured: true, visionCapable: true, models: ["gemini-2.0-flash"] },
			{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] },
		],
	});
	assert(body.ok);
	assert.equal(body.providers.length, 1);
	assert.equal(body.providers[0].id, "volcano");
	assert.equal(evaluateGateE(body.providers).pass, true);
});

test("two volcano providers fail shape validation", () => {
	const duplicate = validateHealthModelsPayload({
		providers: [
			{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] },
			{ id: "gemini", configured: true, visionCapable: true, models: ["gemini-2.0-flash"] },
			{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] },
		],
	});
	assert.equal(duplicate.ok, false);
	assert.match(duplicate.ok ? "" : duplicate.details.join(" "), /volcano provider 必须唯一/);
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
			env: asProcessEnv({
				LAB_PUBLIC_BASE_URL: raw,
				LAB_DOJO_SERVER_KEY: "test-key",
			}),
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
		env: asProcessEnv({
			LAB_PUBLIC_BASE_URL: "https://lab.example.invalid",
			LAB_DOJO_SERVER_KEY: sensitive,
		}),
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

test("runSpikeLabCheck marks gate_e_fail and suggestFallback when volcano not ready", async () => {
	const { exitCode, summary } = await runSpikeLabCheck({
		env: asProcessEnv({
			LAB_PUBLIC_BASE_URL: "https://lab.example.invalid",
			LAB_DOJO_SERVER_KEY: "test-key",
		}),
		fetchImpl: async () =>
			new Response(JSON.stringify(volcanoHealth({ configured: false, visionCapable: false })), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
	});
	assert.equal(exitCode, 1);
	assert.equal(summary.executionStatus, "gate_e_fail");
	assert.equal(summary.suggestFallback, true);
	assert.match(summary.note, /建议 fallback/);
});
