import { filterLabReport } from "@/lib/lab/compliance-filter";
import type { LabProviderHealth } from "@/lib/lab/config";

/** Spike runner 必填环境变量（缺一则 fail closed，不发起外部请求） */
export const SPIKE_REQUIRED_ENV_VAR_NAMES = ["LAB_PUBLIC_BASE_URL", "LAB_DOJO_SERVER_KEY"] as const;

export type SpikeRequiredEnvVar = (typeof SPIKE_REQUIRED_ENV_VAR_NAMES)[number];

export type LabBaseUrlValidation =
	| { ok: true; sanitized: string }
	| { ok: false; reason: string };

function readRawSpikeLabBaseUrl(env: NodeJS.ProcessEnv): string | null {
	const override = env.LAB_SPIKE_LAB_BASE_URL?.trim();
	if (override) return override;
	const base = env.LAB_PUBLIC_BASE_URL?.trim();
	return base || null;
}

/** 校验并净化 base URL；失败时不回显原始值 */
export function validateAndSanitizeLabBaseUrl(raw: string): LabBaseUrlValidation {
	let parsed: URL;
	try {
		parsed = new URL(raw.trim());
	} catch {
		return { ok: false, reason: "LAB_PUBLIC_BASE_URL 不是合法 URL" };
	}

	if (parsed.protocol !== "https:") {
		return { ok: false, reason: "LAB_PUBLIC_BASE_URL 须为 HTTPS" };
	}
	if (parsed.username || parsed.password) {
		return { ok: false, reason: "LAB_PUBLIC_BASE_URL 不得包含用户名或密码" };
	}
	if (parsed.search) {
		return { ok: false, reason: "LAB_PUBLIC_BASE_URL 不得包含 query 参数" };
	}
	if (parsed.hash) {
		return { ok: false, reason: "LAB_PUBLIC_BASE_URL 不得包含 fragment" };
	}

	const pathname = parsed.pathname.replace(/\/$/, "");
	const sanitized = pathname ? `${parsed.protocol}//${parsed.host}${pathname}` : `${parsed.protocol}//${parsed.host}`;
	return { ok: true, sanitized };
}

export function resolveSpikeLabBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
	const raw = readRawSpikeLabBaseUrl(env);
	if (!raw) return null;
	const validated = validateAndSanitizeLabBaseUrl(raw);
	return validated.ok ? validated.sanitized : null;
}

/** 返回缺失变量名；不输出 secret 值 */
export function getMissingSpikeEnvVars(env: NodeJS.ProcessEnv = process.env): SpikeRequiredEnvVar[] {
	const missing: SpikeRequiredEnvVar[] = [];
	if (!readRawSpikeLabBaseUrl(env)) missing.push("LAB_PUBLIC_BASE_URL");
	if (!env.LAB_DOJO_SERVER_KEY?.trim()) missing.push("LAB_DOJO_SERVER_KEY");
	return missing;
}

export function buildHealthModelsUrl(labBaseUrl: string): string {
	return `${labBaseUrl.replace(/\/$/, "")}/health/models`;
}

export type HealthModelsValidation =
	| { ok: true; providers: LabProviderHealth[] }
	| { ok: false; reason: string; details: string[] };

/** 校验 Dojo `/health/models` JSON 形状（不含网络） */
export function validateHealthModelsPayload(body: unknown): HealthModelsValidation {
	if (!body || typeof body !== "object") {
		return { ok: false, reason: "响应不是 JSON 对象", details: [] };
	}

	const providersRaw = (body as { providers?: unknown }).providers;
	if (!Array.isArray(providersRaw)) {
		return { ok: false, reason: "缺少 providers 数组", details: [] };
	}

	const details: string[] = [];
	const mapped: LabProviderHealth[] = [];

	for (const raw of providersRaw) {
		if (!raw || typeof raw !== "object") {
			details.push("providers 项必须是对象");
			continue;
		}
		const row = raw as Record<string, unknown>;
		if (row.id !== "volcano") continue;

		if (typeof row.configured !== "boolean") details.push(`${String(row.id)}: 缺少 boolean configured`);
		if (typeof row.visionCapable !== "boolean") {
			details.push(`${String(row.id)}: 缺少 boolean visionCapable`);
		}
		if (!Array.isArray(row.models)) details.push(`${String(row.id)}: 缺少 models 数组`);

		mapped.push({
			id: row.id,
			configured: row.configured === true,
			visionCapable: row.visionCapable === true,
			models: Array.isArray(row.models) ? row.models.map(String) : [],
			reason: typeof row.reason === "string" ? row.reason : undefined,
		});
	}

	if (!mapped.some((p) => p.id === "volcano")) details.push("缺少 volcano provider");
	if (mapped.length > 1) details.push("volcano provider 必须唯一");
	if (details.length > 0) {
		return { ok: false, reason: "health 响应形状不合规", details };
	}

	return { ok: true, providers: mapped };
}

export type GateEEvaluation = {
	gate: "E";
	pass: boolean;
	volcano: {
		configured: boolean;
		visionCapable: boolean;
		pass: boolean;
		reason?: string;
	};
};

/** Gate E：volcano 须 configured=true 且 visionCapable=true */
export function evaluateGateE(providers: LabProviderHealth[]): GateEEvaluation {
	const volcano = providers.find((p) => p.id === "volcano");
	const volcanoPass = Boolean(volcano?.configured && volcano?.visionCapable);

	return {
		gate: "E",
		pass: volcanoPass,
		volcano: {
			configured: Boolean(volcano?.configured),
			visionCapable: Boolean(volcano?.visionCapable),
			pass: volcanoPass,
			reason: volcanoPass ? undefined : "Volcano 须 configured=true 且 visionCapable=true",
		},
	};
}

export type ReportComplianceResult = { ok: true } | { ok: false; reason: string };

export function validateSpikeReportCompliance(report: unknown): ReportComplianceResult {
	const filtered = filterLabReport(report);
	if (!filtered.ok) return { ok: false, reason: filtered.reason };
	return { ok: true };
}

export type SpikeErrorCategory = "invalid_lab_base_url" | "health_request_failed";

export type SpikeSummary = {
	schemaVersion: "lab-spike-summary-v1";
	executedAt: string;
	executionStatus:
		| "blocked_missing_env"
		| "blocked_invalid_base_url"
		| "blocked_fetch_error"
		| "health_shape_fail"
		| "gate_e_fail"
		| "gate_e_pass"
		| "report_fail"
		| "report_pass";
	missingEnvVars: SpikeRequiredEnvVar[];
	/** 净化后的 HTTPS base URL（仅 hostname/path，无 query/fragment/credentials） */
	labBaseUrl: string | null;
	errorCategory?: SpikeErrorCategory;
	health?: {
		httpStatus: number;
		validation: HealthModelsValidation;
		gateE?: GateEEvaluation;
	};
	report?: ReportComplianceResult;
	suggestFallback: boolean;
	note: string;
};

function blockedSummary(
	status: SpikeSummary["executionStatus"],
	missing: SpikeRequiredEnvVar[],
	baseUrl: string | null,
	note: string,
	extra?: Partial<SpikeSummary>,
): SpikeSummary {
	return {
		schemaVersion: "lab-spike-summary-v1",
		executedAt: new Date().toISOString(),
		executionStatus: status,
		missingEnvVars: missing,
		labBaseUrl: baseUrl,
		suggestFallback: status === "gate_e_fail" || status === "health_shape_fail",
		note,
		...extra,
	};
}

export async function runSpikeLabCheck(options?: {
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	reportJson?: unknown;
}): Promise<{ exitCode: number; summary: SpikeSummary }> {
	const env = options?.env ?? process.env;
	const missing = getMissingSpikeEnvVars(env);

	if (missing.length > 0) {
		return {
			exitCode: 1,
			summary: blockedSummary(
				"blocked_missing_env",
				missing,
				null,
				"缺少必填环境变量；未发起外部请求。请在 VPS 配置后再执行 Gate A–E。",
			),
		};
	}

	const rawBaseUrl = readRawSpikeLabBaseUrl(env)!;
	const baseUrlValidation = validateAndSanitizeLabBaseUrl(rawBaseUrl);
	if (!baseUrlValidation.ok) {
		return {
			exitCode: 1,
			summary: blockedSummary(
				"blocked_invalid_base_url",
				[],
				null,
				baseUrlValidation.reason,
				{ errorCategory: "invalid_lab_base_url" },
			),
		};
	}

	const labBaseUrl = baseUrlValidation.sanitized;
	const fetchFn = options?.fetchImpl ?? fetch;
	const url = buildHealthModelsUrl(labBaseUrl);
	const serverKey = env.LAB_DOJO_SERVER_KEY!.trim();

	let httpStatus = 0;
	let body: unknown;
	try {
		const res = await fetchFn(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${serverKey}` },
			signal: AbortSignal.timeout(8000),
		});
		httpStatus = res.status;
		body = await res.json();
	} catch {
		return {
			exitCode: 1,
			summary: blockedSummary(
				"blocked_fetch_error",
				[],
				labBaseUrl,
				"health_request_failed：无法读取 /health/models。外部 Spike 尚未执行或 VPS 不可达。",
				{ errorCategory: "health_request_failed" },
			),
		};
	}

	const validation = validateHealthModelsPayload(body);
	if (!validation.ok) {
		return {
			exitCode: 1,
			summary: {
				...blockedSummary(
					"health_shape_fail",
					[],
					labBaseUrl,
					"/health/models 响应形状不合规。建议 fallback（尚未实施）。",
				),
				health: { httpStatus, validation },
				suggestFallback: true,
			},
		};
	}

	const gateE = evaluateGateE(validation.providers);
	if (!gateE.pass) {
		return {
			exitCode: 1,
			summary: {
				schemaVersion: "lab-spike-summary-v1",
				executedAt: new Date().toISOString(),
				executionStatus: "gate_e_fail",
				missingEnvVars: [],
				labBaseUrl,
				health: { httpStatus, validation, gateE },
				suggestFallback: true,
				note: "Gate E 未通过。建议 fallback（尚未实施）；不得将 Dojo/volcano 能力描述为已通过。",
			},
		};
	}

	if (options?.reportJson !== undefined) {
		const report = validateSpikeReportCompliance(options.reportJson);
		if (!report.ok) {
			return {
				exitCode: 1,
				summary: {
					schemaVersion: "lab-spike-summary-v1",
					executedAt: new Date().toISOString(),
					executionStatus: "report_fail",
					missingEnvVars: [],
					labBaseUrl,
					health: { httpStatus, validation, gateE },
					report,
					suggestFallback: true,
					note: "样例报告未通过主站 schema/compliance filter。建议 fallback（尚未实施）。",
				},
			};
		}

		return {
			exitCode: 0,
			summary: {
				schemaVersion: "lab-spike-summary-v1",
				executedAt: new Date().toISOString(),
				executionStatus: "report_pass",
				missingEnvVars: [],
				labBaseUrl,
				health: { httpStatus, validation, gateE },
				report,
				suggestFallback: false,
				note: "Gate E 与样例报告校验通过。完整 Gate A–D 仍须在 VPS 手工执行并记录证据。",
			},
		};
	}

	return {
		exitCode: 0,
		summary: {
			schemaVersion: "lab-spike-summary-v1",
			executedAt: new Date().toISOString(),
			executionStatus: "gate_e_pass",
			missingEnvVars: [],
			labBaseUrl,
			health: { httpStatus, validation, gateE },
			suggestFallback: false,
			note: "Gate E（/health/models）通过。Gate A–D 与 volcano 多模态仍须在 VPS 手工验收。",
		},
	};
}

/** 供 CLI 输出；summary 内不得含 secret、query、fragment 或 credentials */
export function formatSpikeSummaryForOutput(summary: SpikeSummary): string {
	return `${JSON.stringify(summary, null, 2)}\n`;
}
