import type { SupabaseClient } from "@supabase/supabase-js";

import { getMarketQuote } from "@/lib/market/market-domain";
import { getChinaTodayRangeIso } from "@/lib/trade/cn-calendar";
import { TRADE_ORDER_MESSAGE_FILLED } from "@/lib/trade/execution-messages";
import { getInstrumentRule } from "@/lib/trade/instrument-rules";
import { matchLimitAgainstQuote } from "@/lib/trade/match-engine";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { getOrCreateTqProductAccount } from "@/lib/trade-v2/account";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import type {
	TradeV2CancelApiResponse,
	TradeV2OrderApiResponse,
	TradeV2OrdersApiResponse,
	TradeV2PositionsApiResponse,
	TradeV2TradesApiResponse,
} from "@/lib/trade-v2/api-types";
import { pushRiskMessage } from "@/lib/trade-v2/risk-messages";
import { consumeLongQuota, consumeShortQuota, getOpeningQuotaSide, getPersonalQuotaForSymbol, listPersonalResources, quotaInsufficientMessage } from "@/lib/trade-v2/resources";
import { explainOperationFailure } from "@/lib/trade-v2/operation-guidance";

type Side = "buy" | "sell";
type PositionMode = "long" | "short";

export type PlaceOrderInput = {
	userId: string;
	symbol: string;
	side: Side;
	price: number;
	quantity: number;
	accountType?: "normal" | "credit";
	positionMode?: PositionMode;
};

export type ApiResult<TBody = Record<string, unknown>> = {
	status: number;
	body: TBody;
};

type TqOrderRow = {
	id: string;
	account_id: string;
	symbol: string;
	side: Side;
	order_type: "limit" | "market";
	price: string | number | null;
	quantity: number;
	filled_qty: number;
	status: "pending" | "partial" | "filled" | "cancelled" | "rejected";
	reject_reason: string | null;
	position_mode: PositionMode;
};

type TqAccountRow = {
	id: string;
	available_balance: string | number;
};

type TqPositionRow = {
	id: string;
	account_id: string;
	symbol: string;
	position_type: PositionMode;
	quantity: number;
	available_qty: number;
	cost_price: string | number;
};

type TqShortLoanRow = {
	id: string;
	remaining_qty: number;
	status: "open" | "closed";
};

type FillDecision = {
	status: "rejected" | "pending" | "partial" | "filled";
	filledQty: number;
	reason?: string;
	priceGapBps: number;
	liquidityScore: number;
	tier: "blocked" | "queue" | "thin" | "normal" | "aggressive";
};

function err(message: string, status = 400): ApiResult<{ success: false; error: string }> {
	return { status, body: { success: false, error: explainOperationFailure(message) } };
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function round4(n: number): number {
	return Math.round(n * 10000) / 10000;
}

function resolveFilledQuantity(totalQty: number, lotSize: number): number {
	if (totalQty <= lotSize * 5) return totalQty;
	const ratio = 0.35 + Math.random() * 0.65;
	const raw = Math.floor((totalQty * ratio) / lotSize) * lotSize;
	return Math.max(lotSize, Math.min(totalQty, raw));
}

function resolveGapBps(side: Side, limitPrice: number, refPrice: number): number {
	if (!Number.isFinite(refPrice) || refPrice <= 0) return 0;
	const rawBps =
		side === "buy"
			? ((limitPrice - refPrice) / refPrice) * 10000
			: ((refPrice - limitPrice) / refPrice) * 10000;
	return Number(rawBps.toFixed(2));
}

function resolveLiquidityScore(quantity: number, lotSize: number, priceGapBps: number): number {
	const lotCount = Math.max(1, Math.floor(quantity / lotSize));
	const sizePenalty = Math.min(0.6, Math.log10(lotCount + 1) * 0.35);
	const priceBonus = Math.min(0.55, Math.max(0, priceGapBps) / 240);
	const score = 0.45 + priceBonus - sizePenalty;
	return Math.max(0.05, Math.min(0.98, Number(score.toFixed(4))));
}

function decideExecution(side: Side, limitPrice: number, refPrice: number, qty: number, lotSize: number): FillDecision {
	const canMatch = matchLimitAgainstQuote(side, limitPrice, refPrice);
	const priceGapBps = resolveGapBps(side, limitPrice, refPrice);
	const liquidityScore = resolveLiquidityScore(qty, lotSize, priceGapBps);
	if (!canMatch) {
		const gapAbs = Math.abs(priceGapBps);
		return {
			status: "pending",
			filledQty: 0,
			reason: `价格未进入可成交区间（偏离 ${gapAbs.toFixed(2)} bps）`,
			priceGapBps,
			liquidityScore,
			tier: "queue",
		};
	}

	const overloadRejectProb = Math.max(0.01, Math.min(0.07, 0.08 - liquidityScore * 0.08));
	if (Math.random() < overloadRejectProb) {
		return {
			status: "rejected",
			filledQty: 0,
			reason: "撮合通道拥堵，委托被风控拦截（模拟）",
			priceGapBps,
			liquidityScore,
			tier: "blocked",
		};
	}

	let ratioBase = liquidityScore;
	if (priceGapBps >= 120) ratioBase = Math.max(ratioBase, 0.92);
	else if (priceGapBps >= 40) ratioBase = Math.max(ratioBase, 0.75);
	else ratioBase = Math.max(ratioBase, 0.45);

	const jitter = (Math.random() - 0.5) * 0.16;
	const ratio = Math.max(0.08, Math.min(1, ratioBase + jitter));
	const filled = Math.max(
		0,
		Math.min(qty, Math.floor((qty * ratio) / lotSize) * lotSize || (ratio >= 0.98 ? qty : 0)),
	);

	if (filled <= 0) {
		return {
			status: "pending",
			filledQty: 0,
			reason: "盘口深度不足，当前进入排队（模拟）",
			priceGapBps,
			liquidityScore,
			tier: "queue",
		};
	}

	if (filled >= qty) {
		return {
			status: "filled",
			filledQty: qty,
			priceGapBps,
			liquidityScore,
			tier: priceGapBps >= 40 ? "aggressive" : "normal",
		};
	}
	const fallbackFilled = resolveFilledQuantity(qty, lotSize);
	const finalFilled = Math.max(filled, fallbackFilled >= qty ? filled : fallbackFilled);
	const partialFilled = Math.min(qty - lotSize, Math.max(lotSize, finalFilled));
	return {
		status: "partial",
		filledQty: partialFilled,
		reason: "盘口深度不足，部分成交（模拟阈值模型）",
		priceGapBps,
		liquidityScore,
		tier: liquidityScore < 0.35 ? "thin" : "normal",
	};
}

async function getAccountById(supabase: SupabaseClient, id: string): Promise<TqAccountRow | null> {
	const { data, error } = await supabase
		.from("tq_product_accounts")
		.select("id,available_balance")
		.eq("id", id)
		.maybeSingle();
	if (error || !data) return null;
	return data as TqAccountRow;
}

async function getPosition(
	supabase: SupabaseClient,
	accountId: string,
	symbol: string,
	positionType: PositionMode,
): Promise<TqPositionRow | null> {
	const { data, error } = await supabase
		.from("tq_positions")
		.select("*")
		.eq("account_id", accountId)
		.eq("symbol", symbol)
		.eq("position_type", positionType)
		.maybeSingle();
	if (error || !data) return null;
	return data as TqPositionRow;
}

async function applyBuyLongFill(
	supabase: SupabaseClient,
	userId: string,
	accountId: string,
	symbol: string,
	qty: number,
	execPrice: number,
	orderId: string,
) {
	await consumeLongQuota(supabase, userId, symbol, qty);

	const account = await getAccountById(supabase, accountId);
	if (!account) throw new Error("账户不存在");
	const available = Number(account.available_balance);
	const cost = round2(execPrice * qty);
	if (available < cost) throw new Error("资金不足");

	const { error: accountErr } = await supabase
		.from("tq_product_accounts")
		.update({ available_balance: round2(available - cost) })
		.eq("id", accountId);
	if (accountErr) throw new Error(accountErr.message);

	const pos = await getPosition(supabase, accountId, symbol, "long");
	if (!pos) {
		const { error: insertErr } = await supabase.from("tq_positions").insert({
			account_id: accountId,
			symbol,
			position_type: "long",
			quantity: qty,
			available_qty: qty,
			cost_price: execPrice,
		});
		if (insertErr) throw new Error(insertErr.message);
	} else {
		const newQty = Number(pos.quantity) + qty;
		const avgCost = round4((Number(pos.quantity) * Number(pos.cost_price) + qty * execPrice) / newQty);
		const { error: updatePosErr } = await supabase
			.from("tq_positions")
			.update({
				quantity: newQty,
				available_qty: Number(pos.available_qty) + qty,
				cost_price: avgCost,
			})
			.eq("id", pos.id);
		if (updatePosErr) throw new Error(updatePosErr.message);
	}

	const { error: tradeErr } = await supabase.from("tq_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol,
		side: "buy",
		price: execPrice,
		quantity: qty,
	});
	if (tradeErr) throw new Error(tradeErr.message);
}

async function applySellLongFill(
	supabase: SupabaseClient,
	accountId: string,
	symbol: string,
	qty: number,
	execPrice: number,
	orderId: string,
) {
	const pos = await getPosition(supabase, accountId, symbol, "long");
	if (!pos) throw new Error("无可卖仓位");
	if (Number(pos.available_qty) < qty) throw new Error("可卖数量不足");

	const nextQty = Number(pos.quantity) - qty;
	const nextAvail = Number(pos.available_qty) - qty;
	if (nextQty <= 0) {
		const { error: deleteErr } = await supabase.from("tq_positions").delete().eq("id", pos.id);
		if (deleteErr) throw new Error(deleteErr.message);
	} else {
		const { error: updatePosErr } = await supabase
			.from("tq_positions")
			.update({ quantity: nextQty, available_qty: nextAvail })
			.eq("id", pos.id);
		if (updatePosErr) throw new Error(updatePosErr.message);
	}

	const account = await getAccountById(supabase, accountId);
	if (!account) throw new Error("账户不存在");
	const available = Number(account.available_balance);
	const proceeds = round2(execPrice * qty);
	const { error: accountErr } = await supabase
		.from("tq_product_accounts")
		.update({ available_balance: round2(available + proceeds) })
		.eq("id", accountId);
	if (accountErr) throw new Error(accountErr.message);

	const { error: tradeErr } = await supabase.from("tq_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol,
		side: "sell",
		price: execPrice,
		quantity: qty,
	});
	if (tradeErr) throw new Error(tradeErr.message);
}

async function recordShortBorrow(
	supabase: SupabaseClient,
	userId: string,
	accountId: string,
	symbol: string,
	qty: number,
	execPrice: number,
) {
	const { error } = await supabase.from("tq_short_loans").insert({
		user_id: userId,
		account_id: accountId,
		symbol,
		borrowed_qty: qty,
		remaining_qty: qty,
		avg_borrow_price: execPrice,
		status: "open",
		opened_at: new Date().toISOString(),
	});
	if (error) throw new Error(error.message);
}

async function consumeShortLoans(
	supabase: SupabaseClient,
	accountId: string,
	symbol: string,
	qty: number,
) {
	let remain = qty;
	const { data, error } = await supabase
		.from("tq_short_loans")
		.select("id,remaining_qty,status")
		.eq("account_id", accountId)
		.eq("symbol", symbol)
		.eq("status", "open")
		.order("opened_at", { ascending: true });
	if (error) throw new Error(error.message);

	for (const row of (data ?? []) as TqShortLoanRow[]) {
		if (remain <= 0) break;
		const available = Number(row.remaining_qty ?? 0);
		if (available <= 0) continue;
		const deduct = Math.min(available, remain);
		const nextRemain = available - deduct;
		const patch =
			nextRemain <= 0
				? { remaining_qty: 0, status: "closed", closed_at: new Date().toISOString() }
				: { remaining_qty: nextRemain };
		const { error: updateErr } = await supabase.from("tq_short_loans").update(patch).eq("id", row.id);
		if (updateErr) throw new Error(updateErr.message);
		remain -= deduct;
	}

	if (remain > 0) {
		throw new Error("可回补借券数量不足");
	}
}

async function applySellShortOpenFill(
	supabase: SupabaseClient,
	userId: string,
	accountId: string,
	symbol: string,
	qty: number,
	execPrice: number,
	orderId: string,
) {
	await consumeShortQuota(supabase, userId, symbol, qty);

	const account = await getAccountById(supabase, accountId);
	if (!account) throw new Error("账户不存在");
	const available = Number(account.available_balance);
	const proceeds = round2(execPrice * qty);
	const { error: accountErr } = await supabase
		.from("tq_product_accounts")
		.update({ available_balance: round2(available + proceeds) })
		.eq("id", accountId);
	if (accountErr) throw new Error(accountErr.message);

	const pos = await getPosition(supabase, accountId, symbol, "short");
	if (!pos) {
		const { error: insertErr } = await supabase.from("tq_positions").insert({
			account_id: accountId,
			symbol,
			position_type: "short",
			quantity: qty,
			available_qty: qty,
			cost_price: execPrice,
		});
		if (insertErr) throw new Error(insertErr.message);
	} else {
		const newQty = Number(pos.quantity) + qty;
		const avgCost = round4((Number(pos.quantity) * Number(pos.cost_price) + qty * execPrice) / newQty);
		const { error: updatePosErr } = await supabase
			.from("tq_positions")
			.update({
				quantity: newQty,
				available_qty: Number(pos.available_qty) + qty,
				cost_price: avgCost,
			})
			.eq("id", pos.id);
		if (updatePosErr) throw new Error(updatePosErr.message);
	}

	await recordShortBorrow(supabase, userId, accountId, symbol, qty, execPrice);

	const { error: tradeErr } = await supabase.from("tq_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol,
		side: "sell",
		price: execPrice,
		quantity: qty,
	});
	if (tradeErr) throw new Error(tradeErr.message);
}

async function applyBuyShortCoverFill(
	supabase: SupabaseClient,
	accountId: string,
	symbol: string,
	qty: number,
	execPrice: number,
	orderId: string,
) {
	const pos = await getPosition(supabase, accountId, symbol, "short");
	if (!pos) throw new Error("无可回补空仓");
	if (Number(pos.available_qty) < qty) throw new Error("可回补数量不足");

	const account = await getAccountById(supabase, accountId);
	if (!account) throw new Error("账户不存在");
	const available = Number(account.available_balance);
	const cost = round2(execPrice * qty);
	if (available < cost) throw new Error("资金不足，无法回补");

	const { error: accountErr } = await supabase
		.from("tq_product_accounts")
		.update({ available_balance: round2(available - cost) })
		.eq("id", accountId);
	if (accountErr) throw new Error(accountErr.message);

	const nextQty = Number(pos.quantity) - qty;
	const nextAvail = Number(pos.available_qty) - qty;
	if (nextQty <= 0) {
		const { error: deleteErr } = await supabase.from("tq_positions").delete().eq("id", pos.id);
		if (deleteErr) throw new Error(deleteErr.message);
	} else {
		const { error: updatePosErr } = await supabase
			.from("tq_positions")
			.update({ quantity: nextQty, available_qty: nextAvail })
			.eq("id", pos.id);
		if (updatePosErr) throw new Error(updatePosErr.message);
	}

	await consumeShortLoans(supabase, accountId, symbol, qty);

	const { error: tradeErr } = await supabase.from("tq_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol,
		side: "buy",
		price: execPrice,
		quantity: qty,
	});
	if (tradeErr) throw new Error(tradeErr.message);
}

export async function placeV2Order(
	supabase: SupabaseClient,
	input: PlaceOrderInput,
): Promise<ApiResult<TradeV2OrderApiResponse>> {
	const symbol = normalizeCnSymbol(input.symbol);
	const positionMode: PositionMode = input.positionMode === "short" ? "short" : "long";
	if (!isCanonicalCnSymbol(symbol)) return err(SYMBOL_FORMAT_ERROR_MESSAGE);
	if (input.side !== "buy" && input.side !== "sell") return err("side 须为 buy 或 sell");
	if (!Number.isFinite(input.price) || input.price <= 0) return err("price 必须大于 0");
	if (!Number.isInteger(input.quantity) || input.quantity <= 0) return err("quantity 必须为正整数");

	const rule = getInstrumentRule(symbol);
	if (input.quantity % rule.lotSize !== 0) {
		return err(`quantity 须为 ${rule.lotSize} 的整数倍`);
	}

	const { data: account, error: accountErr } = await getOrCreateTqProductAccount(
		supabase,
		input.userId,
		input.accountType ?? "normal",
	);
	if (accountErr || !account) return err(accountErr?.message ?? "账户不可用", 500);

	const quote = await getMarketQuote(symbol);
	if (!quote) return err("暂时无法获取行情", 503);

	const { data: inserted, error: insertErr } = await supabase
		.from("tq_orders")
		.insert({
			account_id: account.id,
			symbol,
			side: input.side,
			order_type: "limit",
			price: input.price,
			quantity: input.quantity,
			filled_qty: 0,
			status: "pending",
			position_mode: positionMode,
		})
		.select("*")
		.single();
	if (insertErr || !inserted) return err(insertErr?.message ?? "下单失败", 500);
	const order = inserted as TqOrderRow;

	const decision = decideExecution(input.side, input.price, quote.price, input.quantity, rule.lotSize);
	if (decision.status === "pending") {
		return {
			status: 200,
			body: {
				success: true,
				data: {
					id: order.id,
					status: "pending",
					filled_qty: 0,
					remaining_qty: input.quantity,
					position_mode: positionMode,
					price_gap_bps: decision.priceGapBps,
					liquidity_score: decision.liquidityScore,
					execution_tier: decision.tier,
					execution_model: "threshold-v1",
					message: decision.reason ?? "已挂单，等待成交",
				},
			},
		};
	}
	if (decision.status === "rejected") {
		const rejectReason = explainOperationFailure(decision.reason ?? "委托被拦截（模拟）");
		await supabase
			.from("tq_orders")
			.update({
				status: "rejected",
				reject_reason: rejectReason,
			})
			.eq("id", order.id);
		try {
			await pushRiskMessage(supabase, {
				userId: input.userId,
				level: "warning",
				code: "BROKER_SIM_DROP",
				title: "委托被风控拦截（模拟）",
				content: `${rejectReason} | tier=${decision.tier} | gapBps=${decision.priceGapBps} | liq=${decision.liquidityScore}`,
				meta: {
					orderId: order.id,
					symbol,
					side: input.side,
					positionMode,
					executionTier: decision.tier,
					liquidityScore: decision.liquidityScore,
					priceGapBps: decision.priceGapBps,
					executionModel: "threshold-v1",
				},
			});
		} catch {
			// 风控消息失败不阻塞主流程。
		}
		return {
			status: 409,
			body: {
				success: false,
				error: rejectReason,
				data: {
					id: order.id,
					status: "rejected",
					position_mode: positionMode,
					filled_qty: 0,
					remaining_qty: input.quantity,
					price_gap_bps: decision.priceGapBps,
					liquidity_score: decision.liquidityScore,
					execution_tier: decision.tier,
					execution_model: "threshold-v1",
					message: rejectReason,
				},
			},
		};
	}

	try {
		const openingSide = getOpeningQuotaSide(positionMode, input.side);
		if (openingSide) {
			const personal = await listPersonalResources(supabase, input.userId);
			const available = getPersonalQuotaForSymbol(personal, symbol, openingSide);
			if (available < decision.filledQty) {
				throw new Error(quotaInsufficientMessage(openingSide));
			}
		}
		if (positionMode === "long") {
			if (input.side === "buy") {
				await applyBuyLongFill(
					supabase,
					input.userId,
					account.id,
					symbol,
					decision.filledQty,
					quote.price,
					order.id,
				);
			} else {
				await applySellLongFill(supabase, account.id, symbol, decision.filledQty, quote.price, order.id);
			}
		} else {
			if (input.side === "sell") {
				await applySellShortOpenFill(
					supabase,
					input.userId,
					account.id,
					symbol,
					decision.filledQty,
					quote.price,
					order.id,
				);
			} else {
				await applyBuyShortCoverFill(supabase, account.id, symbol, decision.filledQty, quote.price, order.id);
			}
		}

		const { error: orderUpdateErr } = await supabase
			.from("tq_orders")
			.update({
				filled_qty: decision.filledQty,
				status: decision.status,
				reject_reason: decision.reason ?? null,
			})
			.eq("id", order.id);
		if (orderUpdateErr) return err(orderUpdateErr.message, 500);
		return {
			status: 200,
			body: {
				success: true,
				data: {
					id: order.id,
					status: decision.status,
					position_mode: positionMode,
					filled_qty: decision.filledQty,
					remaining_qty: Math.max(0, input.quantity - decision.filledQty),
					exec_price: quote.price,
					price_gap_bps: decision.priceGapBps,
					liquidity_score: decision.liquidityScore,
					execution_tier: decision.tier,
					execution_model: "threshold-v1",
					message: decision.reason ?? TRADE_ORDER_MESSAGE_FILLED,
				},
			},
		};
	} catch (error) {
		const reason = explainOperationFailure(error instanceof Error ? error.message : "撮合失败");
		await supabase
			.from("tq_orders")
			.update({
				status: "rejected",
				reject_reason: reason,
			})
			.eq("id", order.id);
		try {
			await pushRiskMessage(supabase, {
				userId: input.userId,
				level: "error",
				code: "ORDER_REJECTED",
				title: "下单失败",
				content: reason,
				meta: {
					orderId: order.id,
					symbol,
					side: input.side,
					positionMode,
					quantity: input.quantity,
					price: input.price,
				},
			});
		} catch {
			// ignore
		}
		return err(reason, 400);
	}
}

export async function cancelV2Order(
	supabase: SupabaseClient,
	userId: string,
	orderId: string,
	accountType: "normal" | "credit" = "normal",
): Promise<ApiResult<TradeV2CancelApiResponse>> {
	const { data: account, error: accountErr } = await getOrCreateTqProductAccount(supabase, userId, accountType);
	if (accountErr || !account) return err(accountErr?.message ?? "账户不可用", 500);

	const { data: order, error: orderErr } = await supabase
		.from("tq_orders")
		.select("*")
		.eq("id", orderId)
		.eq("account_id", account.id)
		.maybeSingle();
	if (orderErr) return err(orderErr.message, 500);
	if (!order) return err("委托不存在", 404);
	const row = order as TqOrderRow;
	if (row.status !== "pending") return err("仅可撤销待成交委托");

	const { error: cancelErr } = await supabase
		.from("tq_orders")
		.update({ status: "cancelled" })
		.eq("id", row.id);
	if (cancelErr) return err(cancelErr.message, 500);

	return { status: 200, body: { success: true, data: { id: row.id, status: "cancelled" } } };
}

export async function listV2Orders(
	supabase: SupabaseClient,
	userId: string,
	accountType: "normal" | "credit" = "normal",
): Promise<ApiResult<TradeV2OrdersApiResponse>> {
	const { data: account, error: accountErr } = await getOrCreateTqProductAccount(supabase, userId, accountType);
	if (accountErr || !account) return err(accountErr?.message ?? "账户不可用", 500);

	const { start, end } = getChinaTodayRangeIso();
	const { data, error } = await supabase
		.from("tq_orders")
		.select("*")
		.eq("account_id", account.id)
		.gte("created_at", start)
		.lt("created_at", end)
		.order("created_at", { ascending: false });
	if (error) return err(error.message, 500);
	return { status: 200, body: { success: true, data: data ?? [] } };
}

export async function listV2Trades(
	supabase: SupabaseClient,
	userId: string,
	accountType: "normal" | "credit" = "normal",
): Promise<ApiResult<TradeV2TradesApiResponse>> {
	const { data: account, error: accountErr } = await getOrCreateTqProductAccount(supabase, userId, accountType);
	if (accountErr || !account) return err(accountErr?.message ?? "账户不可用", 500);

	const { start, end } = getChinaTodayRangeIso();
	const { data, error } = await supabase
		.from("tq_trades")
		.select("*")
		.eq("account_id", account.id)
		.gte("trade_time", start)
		.lt("trade_time", end)
		.order("trade_time", { ascending: false });
	if (error) return err(error.message, 500);
	return { status: 200, body: { success: true, data: data ?? [] } };
}

export async function listV2Positions(
	supabase: SupabaseClient,
	userId: string,
	accountType: "normal" | "credit" = "normal",
): Promise<ApiResult<TradeV2PositionsApiResponse>> {
	const { data: account, error: accountErr } = await getOrCreateTqProductAccount(supabase, userId, accountType);
	if (accountErr || !account) return err(accountErr?.message ?? "账户不可用", 500);

	const { data, error } = await supabase
		.from("tq_positions")
		.select("*")
		.eq("account_id", account.id)
		.gt("quantity", 0)
		.order("symbol", { ascending: true });
	if (error) return err(error.message, 500);
	return { status: 200, body: { success: true, data: data ?? [] } };
}
