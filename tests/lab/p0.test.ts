import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { filterLabReport } from "@/lib/lab/compliance-filter";
import { canAccessLabFromHint } from "@/lib/lab/access";
import { resolveAdminModelSelection } from "@/lib/lab/admin-model-select";
import {
	fetchLabProviderHealth,
	getLabActiveModel,
	isModelSelectable,
	type LabProviderHealth,
} from "@/lib/lab/config";
import { exchangeLabAuthCode, issueLabAuthCode, verifyLabSessionToken } from "@/lib/lab/sso";
import { canUseLabAccess, type CurrentMembership } from "@/lib/membership/v2";
import { POST as writeLabSession } from "@/app/api/lab/session/route";

const validReport = {
	version: "lab-diagnose-v1",
	summary: "组合行业集中度偏高，需练习分散化风险识别。",
	riskThemes: ["行业集中"],
	sectorExposure: [{ sector: "科技", weightNote: "占比偏高" }],
	concentrationNotes: ["单一主题暴露偏大"],
	teachingQuestions: ["若该主题回撤，你会如何复盘？"],
	disclaimer: "本报告仅供学习训练，不构成投资建议；不荐股、无实盘。",
};

type CodeRow = {
	jti: string;
	user_id: string;
	expires_at: string;
	consumed_at: string | null;
};

const sessionUserId = "00000000-0000-4000-8000-000000000001";

const state = {
	codes: new Map<string, CodeRow>(),
	sessions: [] as Array<Record<string, unknown>>,
	membership: null as CurrentMembership | null,
};

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk));
	const bodyText = Buffer.concat(chunks).toString("utf8");
	const body = bodyText ? JSON.parse(bodyText) : null;
	let payload: unknown = { message: "not found" };
	let status = 404;

	if (url.pathname.startsWith("/auth/v1/admin/users/")) {
		payload = { user: { id: url.pathname.split("/").at(-1), email: "member@example.invalid" } };
		status = 200;
	} else if (url.pathname === "/rest/v1/user_memberships" && request.method === "GET") {
		payload = state.membership
			? [
					{
						id: state.membership.id,
						user_id: state.membership.userId,
						plan: state.membership.plan,
						status: state.membership.status,
						trial_end: state.membership.trialEnd,
						current_period_start: state.membership.currentPeriodStart,
						current_period_end: state.membership.currentPeriodEnd,
						cancel_at_period_end: state.membership.cancelAtPeriodEnd,
						stripe_subscription_id: state.membership.stripeSubscriptionId,
						stripe_customer_id: state.membership.stripeCustomerId,
						billing_cycle: state.membership.billingCycle,
						grace_started_at: state.membership.graceStartedAt,
						created_at: state.membership.createdAt,
						updated_at: state.membership.updatedAt,
					},
				]
			: [];
		status = 200;
	} else if (url.pathname === "/rest/v1/lab_sso_codes" && request.method === "POST") {
		state.codes.set(body.jti, { ...body, consumed_at: null });
		payload = [];
		status = 201;
	} else if (url.pathname === "/rest/v1/lab_sso_codes" && request.method === "GET") {
		const jti = url.searchParams.get("jti")?.replace(/^eq\./, "") ?? "";
		const code = state.codes.get(jti);
		payload = code ? [code] : [];
		status = 200;
	} else if (url.pathname === "/rest/v1/lab_sso_codes" && request.method === "PATCH") {
		const jti = url.searchParams.get("jti")?.replace(/^eq\./, "") ?? "";
		const code = state.codes.get(jti);
		if (code && !code.consumed_at) {
			code.consumed_at = body.consumed_at;
			payload = [{ jti: code.jti }];
		} else {
			payload = [];
		}
		status = 200;
	} else if (url.pathname === "/rest/v1/lab_sessions" && request.method === "POST") {
		const row = { ...body, id: `session-${state.sessions.length + 1}`, created_at: new Date().toISOString() };
		state.sessions.push(row);
		payload = [{ id: row.id, created_at: row.created_at }];
		status = 201;
	}

	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(payload));
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const supabaseUrl = `http://127.0.0.1:${address.port}`;

function activeMembership(plan: "T1" | "T2" | "T3", status: CurrentMembership["status"] = "active"): CurrentMembership {
	const now = new Date();
	return {
		id: "membership-1",
		userId: sessionUserId,
		plan,
		status,
		trialEnd: null,
		currentPeriodStart: now.toISOString(),
		currentPeriodEnd: new Date(now.getTime() + 60_000).toISOString(),
		cancelAtPeriodEnd: false,
		stripeSubscriptionId: null,
		stripeCustomerId: null,
		billingCycle: null,
		graceStartedAt: null,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	};
}

process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.LAB_SSO_SECRET = "test-lab-sso-secret";
process.env.LAB_DOJO_SERVER_KEY = "test-dojo-key";

test.after(() => {
	server.close();
});

test("compliance filter allows de-identified reports and rejects prohibited content", () => {
	assert.equal(filterLabReport(validReport).ok, true);
	assert.equal(filterLabReport({ ...validReport, summary: "建议买入科技股" }).ok, false);
	assert.equal(filterLabReport({ ...validReport, summary: "持有 600519" }).ok, false);
	assert.equal(filterLabReport({ ...validReport, summary: "联系 analyst@example.com" }).ok, false);
	assert.equal(filterLabReport({ ...validReport, summary: "联系电话 13800138000" }).ok, false);

	for (const forbiddenKey of ["symbols", "tickers", "orders"]) {
		assert.equal(filterLabReport({ ...validReport, [forbiddenKey]: [] }).ok, false);
	}
});

test("lab access requires active, unexpired T2 or T3 membership", () => {
	assert.equal(canUseLabAccess(activeMembership("T1")), false);
	assert.equal(canUseLabAccess(activeMembership("T2", "paused")), false);

	const expired = activeMembership("T3");
	expired.currentPeriodEnd = new Date(Date.now() - 1).toISOString();
	assert.equal(canUseLabAccess(expired), false);
	assert.equal(canUseLabAccess(activeMembership("T2")), true);
	assert.equal(canUseLabAccess(activeMembership("T3")), true);
});

test("client lab entry hint matches active, unexpired server gate", () => {
	const future = new Date(Date.now() + 60_000).toISOString();
	const past = new Date(Date.now() - 1).toISOString();

	assert.equal(canAccessLabFromHint({ plan: "T2", status: "active", currentPeriodEnd: future }), true);
	assert.equal(canAccessLabFromHint({ plan: "T3", status: "active", currentPeriodEnd: future }), true);
	assert.equal(canAccessLabFromHint({ plan: "T2", status: "active", currentPeriodEnd: past }), false);
	assert.equal(canAccessLabFromHint({ plan: "T2", currentPeriodEnd: future }), false);
});

test("admin model selection requires a health-listed vision-capable model", () => {
	const health: LabProviderHealth = {
		id: "volcano",
		configured: true,
		visionCapable: true,
		models: ["pending-spike"],
	};
	assert.equal(isModelSelectable(health, "pending-spike"), true);
	assert.equal(isModelSelectable(health, "unverified-model"), false);
	assert.equal(isModelSelectable({ ...health, models: [] }, "pending-spike"), false);
});

test("fetchLabProviderHealth fail-closed returns a single volcano placeholder", async () => {
	const previousUrl = process.env.LAB_PUBLIC_BASE_URL;
	const previousPublicUrl = process.env.NEXT_PUBLIC_LAB_BASE_URL;
	const previousKey = process.env.LAB_DOJO_SERVER_KEY;
	delete process.env.LAB_PUBLIC_BASE_URL;
	delete process.env.NEXT_PUBLIC_LAB_BASE_URL;
	delete process.env.LAB_DOJO_SERVER_KEY;

	try {
		const health = await fetchLabProviderHealth();
		assert.equal(health.length, 1);
		assert.equal(health[0].id, "volcano");
		assert.equal(health[0].configured, false);
		assert.equal(health[0].visionCapable, false);
		assert.deepEqual(health[0].models, ["pending-spike"]);
		assert.match(String(health[0].reason), /LAB_PUBLIC_BASE_URL|LAB_DOJO_SERVER_KEY/);
	} finally {
		if (previousUrl === undefined) delete process.env.LAB_PUBLIC_BASE_URL;
		else process.env.LAB_PUBLIC_BASE_URL = previousUrl;
		if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_LAB_BASE_URL;
		else process.env.NEXT_PUBLIC_LAB_BASE_URL = previousPublicUrl;
		if (previousKey === undefined) delete process.env.LAB_DOJO_SERVER_KEY;
		else process.env.LAB_DOJO_SERVER_KEY = previousKey;
	}
});

test("fetchLabProviderHealth fail-closed when health returns two volcano providers", async () => {
	const previousUrl = process.env.LAB_PUBLIC_BASE_URL;
	const previousPublicUrl = process.env.NEXT_PUBLIC_LAB_BASE_URL;
	const previousKey = process.env.LAB_DOJO_SERVER_KEY;
	process.env.LAB_PUBLIC_BASE_URL = "https://lab.example.invalid";
	delete process.env.NEXT_PUBLIC_LAB_BASE_URL;
	process.env.LAB_DOJO_SERVER_KEY = "test-dojo-key";

	let fetchCalled = 0;
	try {
		const health = await fetchLabProviderHealth({
			fetchImpl: async () => {
				fetchCalled += 1;
				return new Response(
					JSON.stringify({
						providers: [
							{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] },
							{ id: "volcano", configured: true, visionCapable: true, models: ["pending-spike"] },
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		});
		assert.equal(fetchCalled, 1);
		assert.equal(health.length, 1);
		assert.equal(health[0].id, "volcano");
		assert.equal(health[0].configured, false);
		assert.equal(health[0].visionCapable, false);
		assert.deepEqual(health[0].models, ["pending-spike"]);
	} finally {
		if (previousUrl === undefined) delete process.env.LAB_PUBLIC_BASE_URL;
		else process.env.LAB_PUBLIC_BASE_URL = previousUrl;
		if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_LAB_BASE_URL;
		else process.env.NEXT_PUBLIC_LAB_BASE_URL = previousPublicUrl;
		if (previousKey === undefined) delete process.env.LAB_DOJO_SERVER_KEY;
		else process.env.LAB_DOJO_SERVER_KEY = previousKey;
	}
});

test("resolveAdminModelSelection prefers a health-listed model over pending-spike", () => {
	assert.equal(resolveAdminModelSelection("pending-spike", ["real-model"]), "real-model");
	assert.equal(resolveAdminModelSelection("real-model", ["real-model", "other"]), "real-model");
	assert.equal(resolveAdminModelSelection("pending-spike", []), "pending-spike");
});

test("getLabActiveModel falls back when stored provider is not volcano", async () => {
	const srv = {
		from() {
			return {
				select() {
					return {
						eq() {
							return {
								async maybeSingle() {
									return {
										data: { value: { provider: "gemini", model_id: "gemini-2.0-flash" } },
										error: null,
									};
								},
							};
						},
					};
				},
			};
		},
	};
	const active = await getLabActiveModel(srv as never);
	assert.deepEqual(active, { provider: "volcano", modelId: "pending-spike" });
});

test("SSO code is single-use and rejects expired database records", async () => {
	const issued = await issueLabAuthCode("member-1");
	const firstExchange = await exchangeLabAuthCode(issued.code);
	assert.equal(firstExchange.userId, "member-1");
	await assert.rejects(() => exchangeLabAuthCode(issued.code), /已使用/);

	const expired = await issueLabAuthCode("member-1");
	const expiredJti = [...state.codes.keys()].at(-1);
	assert(expiredJti);
	state.codes.get(expiredJti)!.expires_at = new Date(Date.now() - 1).toISOString();
	await assert.rejects(() => exchangeLabAuthCode(expired.code), /已过期/);
});

test("SSO fails closed without a production secret", async () => {
	const previousSecret = process.env.LAB_SSO_SECRET;
	const previousNodeEnv = process.env.NODE_ENV;
	const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
	delete process.env.LAB_SSO_SECRET;
	env.NODE_ENV = "production";

	await assert.rejects(() => verifyLabSessionToken("not-a-token"), /LAB_SSO_SECRET is not set/);

	process.env.LAB_SSO_SECRET = previousSecret;
	env.NODE_ENV = previousNodeEnv;
});

test("diagnostic writeback rechecks membership and never persists caller inputSummary", async () => {
	const writeRequest = (provider = "volcano") =>
		new Request("http://localhost/api/lab/session", {
			method: "POST",
			headers: { authorization: "Bearer test-dojo-key", "content-type": "application/json" },
			body: JSON.stringify({
				userId: sessionUserId,
				inputSummary: "买入 600519 的截图",
				provider,
				model: "test-model",
				outputJson: validReport,
			}),
		});

	state.membership = activeMembership("T1");
	const rejected = await writeLabSession(writeRequest());
	assert.equal(rejected.status, 403);
	assert.equal(state.sessions.length, 0);

	state.membership = activeMembership("T2");
	const accepted = await writeLabSession(writeRequest());
	assert.equal(accepted.status, 200);
	assert.equal(state.sessions.length, 1);
	assert.equal(state.sessions[0].provider, "volcano");
	assert.equal(state.sessions[0].input_summary, "已上传组合截图");
	assert.doesNotMatch(String(state.sessions[0].input_summary), /600519|买入/);

	const geminiRejected = await writeLabSession(writeRequest("gemini"));
	assert.equal(geminiRejected.status, 400);
	assert.equal(state.sessions.length, 1);
});
