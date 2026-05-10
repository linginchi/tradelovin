import type { SupabaseClient } from "@supabase/supabase-js";

import { getMarketQuote } from "@/lib/market/market-domain";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import { placeV2Order } from "@/lib/trade-v2/order-service";

type WatchAlertType = "price_above" | "price_below" | "percent_up" | "percent_down";
type ConditionType = "price_>=" | "price_<=";

function ensurePositiveNumber(v: unknown, fieldName: string): number {
	const n = typeof v === "number" ? v : Number(v);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`${fieldName} 必须为大于0的数字`);
	}
	return n;
}

export async function listWatchlist(supabase: SupabaseClient, userId: string) {
	const { data, error } = await supabase
		.from("tq_watchlist")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return data ?? [];
}

export async function createWatchlist(
	supabase: SupabaseClient,
	userId: string,
	input: { symbol: string; alertPrice: number; alertType: WatchAlertType },
) {
	const symbol = normalizeCnSymbol(input.symbol);
	if (!isCanonicalCnSymbol(symbol)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	const alertPrice = ensurePositiveNumber(input.alertPrice, "alertPrice");

	const { data, error } = await supabase
		.from("tq_watchlist")
		.insert({
			user_id: userId,
			symbol,
			alert_price: alertPrice,
			alert_type: input.alertType,
			triggered: false,
		})
		.select("*")
		.single();
	if (error || !data) throw new Error(error?.message ?? "创建监控失败");
	return data;
}

export async function deleteWatchlist(supabase: SupabaseClient, userId: string, id: string) {
	const { error } = await supabase.from("tq_watchlist").delete().eq("id", id).eq("user_id", userId);
	if (error) throw new Error(error.message);
}

export async function listConditions(supabase: SupabaseClient, userId: string) {
	const { data, error } = await supabase
		.from("tq_conditional_orders")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return data ?? [];
}

export async function createCondition(
	supabase: SupabaseClient,
	userId: string,
	input: {
		symbol: string;
		conditionType: ConditionType;
		conditionPrice: number;
		orderSide: "buy" | "sell";
		orderPrice: number;
		orderQuantity: number;
	},
) {
	const symbol = normalizeCnSymbol(input.symbol);
	if (!isCanonicalCnSymbol(symbol)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	const conditionPrice = ensurePositiveNumber(input.conditionPrice, "conditionPrice");
	const orderPrice = ensurePositiveNumber(input.orderPrice, "orderPrice");
	const orderQuantity = ensurePositiveNumber(input.orderQuantity, "orderQuantity");

	const { data, error } = await supabase
		.from("tq_conditional_orders")
		.insert({
			user_id: userId,
			symbol,
			condition_type: input.conditionType,
			condition_price: conditionPrice,
			order_side: input.orderSide,
			order_price: orderPrice,
			order_quantity: orderQuantity,
			status: "active",
		})
		.select("*")
		.single();
	if (error || !data) throw new Error(error?.message ?? "创建条件单失败");
	return data;
}

export async function deleteCondition(supabase: SupabaseClient, userId: string, id: string) {
	const { error } = await supabase.from("tq_conditional_orders").delete().eq("id", id).eq("user_id", userId);
	if (error) throw new Error(error.message);
}

function watchMatched(
	alertType: WatchAlertType,
	currentPrice: number,
	alertPrice: number,
): boolean {
	if (alertType === "price_above") return currentPrice >= alertPrice;
	if (alertType === "price_below") return currentPrice <= alertPrice;
	// percent_up / percent_down 先沿用阈值价格比较，后续可接昨收价计算百分比。
	if (alertType === "percent_up") return currentPrice >= alertPrice;
	return currentPrice <= alertPrice;
}

export async function checkWatchlistTriggers(supabase: SupabaseClient, userId: string) {
	const { data, error } = await supabase
		.from("tq_watchlist")
		.select("*")
		.eq("user_id", userId)
		.eq("triggered", false)
		.order("created_at", { ascending: true });
	if (error) throw new Error(error.message);

	let checked = 0;
	let triggered = 0;
	for (const row of data ?? []) {
		checked += 1;
		const symbol = normalizeCnSymbol(String(row.symbol ?? ""));
		const quote = await getMarketQuote(symbol);
		if (!quote) continue;
		const matched = watchMatched(
			row.alert_type as WatchAlertType,
			quote.price,
			Number(row.alert_price ?? 0),
		);
		if (!matched) continue;
		triggered += 1;
		await supabase.from("tq_watchlist").update({ triggered: true }).eq("id", String(row.id));
	}
	return { checked, triggered };
}

function conditionMatched(conditionType: ConditionType, currentPrice: number, conditionPrice: number): boolean {
	if (conditionType === "price_>=") return currentPrice >= conditionPrice;
	return currentPrice <= conditionPrice;
}

export async function triggerConditions(supabase: SupabaseClient, userId: string) {
	const { data, error } = await supabase
		.from("tq_conditional_orders")
		.select("*")
		.eq("user_id", userId)
		.eq("status", "active")
		.order("created_at", { ascending: true });
	if (error) throw new Error(error.message);

	let total = 0;
	let triggered = 0;
	let failed = 0;

	for (const row of data ?? []) {
		total += 1;
		const symbol = normalizeCnSymbol(String(row.symbol ?? ""));
		const quote = await getMarketQuote(symbol);
		if (!quote) continue;
		const matched = conditionMatched(
			row.condition_type as ConditionType,
			quote.price,
			Number(row.condition_price ?? 0),
		);
		if (!matched) continue;

		const result = await placeV2Order(supabase, {
			userId,
			symbol,
			side: (row.order_side as "buy" | "sell") ?? "buy",
			price: Number(row.order_price ?? quote.price),
			quantity: Number(row.order_quantity ?? 0),
			positionMode: "long",
		});

		if (result.status >= 400 || result.body.success !== true) {
			failed += 1;
			continue;
		}

		triggered += 1;
		await supabase
			.from("tq_conditional_orders")
			.update({ status: "triggered" })
			.eq("id", String(row.id));
	}

	return { total, triggered, failed };
}
