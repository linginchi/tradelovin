import type { SupabaseClient } from "@supabase/supabase-js";

import { validateHealthModelsPayload } from "@/lib/lab/spike-check";

export type LabModelProvider = "volcano";

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
	provider: "volcano",
	modelId: "pending-spike",
};

function volcanoPlaceholder(reason: string): LabProviderHealth {
	return {
		id: "volcano",
		configured: false,
		visionCapable: false,
		models: ["pending-spike"],
		reason,
	};
}

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
	if (value.provider !== "volcano") return DEFAULT_ACTIVE;
	const modelId = typeof value.model_id === "string" && value.model_id.trim() ? value.model_id.trim() : DEFAULT_ACTIVE.modelId;
	return { provider: "volcano", modelId };
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

/** 拉取 Dojo /health/models；不可达或形状不合规则返回未配置占位 */
export async function fetchLabProviderHealth(options?: {
	fetchImpl?: typeof fetch;
}): Promise<LabProviderHealth[]> {
	const url = getLabDojoHealthUrl();
	const serverKey = process.env.LAB_DOJO_SERVER_KEY?.trim();
	if (!url || !serverKey) {
		return [volcanoPlaceholder("LAB_PUBLIC_BASE_URL 或 LAB_DOJO_SERVER_KEY 未配置")];
	}

	const fetchFn = options?.fetchImpl ?? fetch;
	try {
		const res = await fetchFn(url, {
			headers: { Authorization: `Bearer ${serverKey}` },
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
		});
		const json: unknown = await res.json();
		if (!res.ok) {
			throw new Error(`health http ${res.status}`);
		}
		const validation = validateHealthModelsPayload(json);
		if (!validation.ok) {
			const message = validation.details.length
				? `${validation.reason}：${validation.details.join("；")}`
				: validation.reason;
			return [volcanoPlaceholder(message)];
		}
		return validation.providers;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return [volcanoPlaceholder(`Dojo 不可达: ${message}`)];
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
