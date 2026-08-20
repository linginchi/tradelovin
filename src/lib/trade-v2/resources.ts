import type { SupabaseClient } from "@supabase/supabase-js";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";

export type ResourceSide = "long" | "short";

type PersonalQuotaLookupRow = {
	symbol: string;
	long_quota: number;
	short_quota: number;
	dynamic_quota?: number;
};

export function getPersonalQuotaForSymbol(
	rows: PersonalQuotaLookupRow[],
	symbolRaw: string,
	side: ResourceSide,
): number {
	const symbol = symbolRaw.trim().toUpperCase();
	const row = rows.find((item) => item.symbol.trim().toUpperCase() === symbol);
	if (!row) return 0;
	const base = side === "long" ? Number(row.long_quota ?? 0) : Number(row.short_quota ?? 0);
	return Math.max(0, base) + Math.max(0, Number(row.dynamic_quota ?? 0));
}

export function getOpeningQuotaSide(
	positionMode: ResourceSide,
	side: "buy" | "sell",
): ResourceSide | null {
	if (positionMode === "long" && side === "buy") return "long";
	if (positionMode === "short" && side === "sell") return "short";
	return null;
}

export function quotaInsufficientMessage(side: ResourceSide): string {
	const label = side === "long" ? "多头" : "空头";
	return `${label}额度不足，请先在「资源」申请${label}额度`;
}

export function isQuotaInsufficientReason(reason: string | null | undefined): boolean {
	return Boolean(reason && reason.includes("额度不足"));
}

type UserResourceRow = {
	id: string;
	user_id: string;
	symbol: string;
	long_quota: number;
	short_quota: number;
	updated_at: string;
};

type PublicResourceRow = {
	id: string;
	symbol: string;
	name: string | null;
	long_limit: number;
	short_limit: number;
	updated_at: string;
};

type DynamicRow = {
	id: string;
	user_id: string;
	symbol: string;
	quantity: number;
	expires_at: string | null;
	created_at: string;
};

export async function listPublicResources(supabase: SupabaseClient): Promise<PublicResourceRow[]> {
	const { data, error } = await supabase
		.from("tq_public_resources")
		.select("*")
		.order("symbol", { ascending: true });
	if (error) throw new Error(error.message);
	return (data ?? []) as PublicResourceRow[];
}

export async function listPersonalResources(
	supabase: SupabaseClient,
	userId: string,
): Promise<Array<UserResourceRow & { dynamic_quota: number }>> {
	const nowIso = new Date().toISOString();
	const [{ data: baseRows, error: baseErr }, { data: dynamicRows, error: dynamicErr }] = await Promise.all([
		supabase.from("tq_user_resources").select("*").eq("user_id", userId).order("symbol", { ascending: true }),
		supabase
			.from("tq_dynamic_resources")
			.select("*")
			.eq("user_id", userId)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`),
	]);
	if (baseErr) throw new Error(baseErr.message);
	if (dynamicErr) throw new Error(dynamicErr.message);

	const dynamicMap = new Map<string, number>();
	for (const row of (dynamicRows ?? []) as DynamicRow[]) {
		const key = row.symbol.toUpperCase();
		dynamicMap.set(key, (dynamicMap.get(key) ?? 0) + Number(row.quantity ?? 0));
	}

	return ((baseRows ?? []) as UserResourceRow[]).map((row) => ({
		...row,
		dynamic_quota: dynamicMap.get(row.symbol.toUpperCase()) ?? 0,
	}));
}

export async function applyResource(
	serviceSupabase: SupabaseClient,
	userId: string,
	symbol: string,
	side: ResourceSide,
	quantity: number,
) {
	const normalizedSymbol = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalizedSymbol)) {
		throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	}
	const { data, error } = await serviceSupabase.rpc("tq_apply_resource", {
		p_user_id: userId,
		p_symbol: normalizedSymbol,
		p_side: side,
		p_quantity: quantity,
	});
	if (error) throw new Error(error.message);
	return data;
}

export async function returnResource(
	serviceSupabase: SupabaseClient,
	userId: string,
	symbol: string,
	side: ResourceSide,
	quantity: number,
) {
	const normalizedSymbol = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalizedSymbol)) {
		throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	}
	const { data, error } = await serviceSupabase.rpc("tq_return_resource", {
		p_user_id: userId,
		p_symbol: normalizedSymbol,
		p_side: side,
		p_quantity: quantity,
	});
	if (error) throw new Error(error.message);
	return data;
}

export async function consumeLongQuota(
	supabase: SupabaseClient,
	userId: string,
	symbolRaw: string,
	quantity: number,
): Promise<void> {
	return consumeQuotaBySide(supabase, userId, symbolRaw, quantity, "long");
}

export async function consumeShortQuota(
	supabase: SupabaseClient,
	userId: string,
	symbolRaw: string,
	quantity: number,
): Promise<void> {
	return consumeQuotaBySide(supabase, userId, symbolRaw, quantity, "short");
}

async function consumeQuotaBySide(
	supabase: SupabaseClient,
	userId: string,
	symbolRaw: string,
	quantity: number,
	side: ResourceSide,
): Promise<void> {
	const symbol = normalizeCnSymbol(symbolRaw);
	if (!isCanonicalCnSymbol(symbol)) {
		throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	}
	if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity 必须为正整数");

	const { data: baseRow, error: baseErr } = await supabase
		.from("tq_user_resources")
		.select("*")
		.eq("user_id", userId)
		.eq("symbol", symbol)
		.maybeSingle();
	if (baseErr) throw new Error(baseErr.message);

	let remain = quantity;
	if (baseRow) {
		const current =
			side === "long"
				? Number((baseRow as UserResourceRow).long_quota ?? 0)
				: Number((baseRow as UserResourceRow).short_quota ?? 0);
		const deduct = Math.min(current, remain);
		if (deduct > 0) {
			const row = baseRow as UserResourceRow;
			const patch =
				side === "long"
					? { long_quota: current - deduct }
					: { short_quota: current - deduct };
			const { error: updateErr } = await supabase
				.from("tq_user_resources")
				.update(patch)
				.eq("id", row.id);
			if (updateErr) throw new Error(updateErr.message);
			remain -= deduct;
		}
	}

	if (remain <= 0) return;

	const nowIso = new Date().toISOString();
	const { data: dynamicRows, error: dynamicErr } = await supabase
		.from("tq_dynamic_resources")
		.select("*")
		.eq("user_id", userId)
		.eq("symbol", symbol)
		.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
		.order("created_at", { ascending: true });
	if (dynamicErr) throw new Error(dynamicErr.message);

	for (const row of (dynamicRows ?? []) as DynamicRow[]) {
		if (remain <= 0) break;
		const available = Number(row.quantity ?? 0);
		const deduct = Math.min(available, remain);
		if (deduct <= 0) continue;
		const next = available - deduct;
		if (next > 0) {
			const { error: updateErr } = await supabase
				.from("tq_dynamic_resources")
				.update({ quantity: next })
				.eq("id", row.id);
			if (updateErr) throw new Error(updateErr.message);
		} else {
			const { error: deleteErr } = await supabase.from("tq_dynamic_resources").delete().eq("id", row.id);
			if (deleteErr) throw new Error(deleteErr.message);
		}
		remain -= deduct;
	}

	if (remain > 0) {
		throw new Error(quotaInsufficientMessage(side));
	}
}
