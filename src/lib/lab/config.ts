import type { SupabaseClient } from "@supabase/supabase-js";

export type LabModelProvider = "gemini" | "glm";

export type LabActiveModel = {
	provider: LabModelProvider;
	modelId: string;
};

export type LabProviderHealth = {
	id: LabModelProvider;
	configured: boolean;
	visionCapable: boolean;
	models: string[];
	reason?: string;
};

const DEFAULT_ACTIVE: LabActiveModel = {
	provider: "gemini",
	modelId: "gemini-2.0-flash",
};

export function getLabDojoHealthUrl(): string | null {
	const base =
		process.env.LAB_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_LAB_BASE_URL?.trim();
	if (!base) return null;
	return `${base.replace(/\/$/, "")}/health/models`;
}

export async function getLabActiveModel(srv: SupabaseClient): Promise<LabActiveModel> {
	const { data, error } = await srv.from("lab_config").select("value").eq("key", "active_model").maybeSingle();
	if (error || !data?.value || typeof data.value !== "object") return DEFAULT_ACTIVE;
	const value = data.value as Record<string, unknown>;
	const provider = value.provider === "glm" ? "glm" : "gemini";
	const modelId = typeof value.model_id === "string" && value.model_id.trim() ? value.model_id.trim() : DEFAULT_ACTIVE.modelId;
	return { provider, modelId };
}

export async function setLabActiveModel(
	srv: SupabaseClient,
	active: LabActiveModel,
	updatedBy?: string | null,
): Promise<void> {
	const { error } = await srv.from("lab_config").upsert(
		{
			key: "active_model",
			value: { provider: active.provider, model_id: active.modelId },
			updated_at: new Date().toISOString(),
			updated_by: updatedBy ?? null,
		},
		{ onConflict: "key" },
	);
	if (error) throw new Error(error.message);
}

/** 拉取 Dojo /health/models；不可达时返回未配置占位 */
export async function fetchLabProviderHealth(): Promise<LabProviderHealth[]> {
	const url = getLabDojoHealthUrl();
	const serverKey = process.env.LAB_DOJO_SERVER_KEY?.trim();
	if (!url || !serverKey) {
		return [
			{
				id: "gemini",
				configured: false,
				visionCapable: false,
				models: ["gemini-2.0-flash"],
				reason: "LAB_PUBLIC_BASE_URL 或 LAB_DOJO_SERVER_KEY 未配置",
			},
			{
				id: "glm",
				configured: false,
				visionCapable: false,
				models: [],
				reason: "LAB_PUBLIC_BASE_URL 或 LAB_DOJO_SERVER_KEY 未配置",
			},
		];
	}

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${serverKey}` },
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
		});
		const json = (await res.json()) as {
			providers?: Array<{
				id?: string;
				configured?: boolean;
				visionCapable?: boolean;
				models?: string[];
				reason?: string;
			}>;
		};
		if (!res.ok || !Array.isArray(json.providers)) {
			throw new Error(`health http ${res.status}`);
		}
		const mapped: LabProviderHealth[] = [];
		for (const p of json.providers) {
			if (p.id !== "gemini" && p.id !== "glm") continue;
			mapped.push({
				id: p.id,
				configured: Boolean(p.configured),
				visionCapable: Boolean(p.visionCapable),
				models: Array.isArray(p.models) ? p.models.map(String) : [],
				reason: typeof p.reason === "string" ? p.reason : undefined,
			});
		}
		if (!mapped.some((m) => m.id === "gemini")) {
			mapped.unshift({
				id: "gemini",
				configured: false,
				visionCapable: false,
				models: ["gemini-2.0-flash"],
				reason: "health 未返回 gemini",
			});
		}
		if (!mapped.some((m) => m.id === "glm")) {
			mapped.push({
				id: "glm",
				configured: false,
				visionCapable: false,
				models: [],
				reason: "health 未返回 glm",
			});
		}
		return mapped;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return [
			{
				id: "gemini",
				configured: false,
				visionCapable: false,
				models: ["gemini-2.0-flash"],
				reason: `Dojo 不可达: ${message}`,
			},
			{
				id: "glm",
				configured: false,
				visionCapable: false,
				models: [],
				reason: `Dojo 不可达: ${message}`,
			},
		];
	}
}

export function isProviderSelectable(health: LabProviderHealth | undefined): boolean {
	return Boolean(health?.configured && health.visionCapable);
}

/** 只允许 health endpoint 明确列出的、已通过 vision 检查的模型。 */
export function isModelSelectable(health: LabProviderHealth | undefined, modelId: string): boolean {
	return Boolean(
		isProviderSelectable(health) &&
			modelId.trim() &&
			health?.models.includes(modelId.trim()),
	);
}
