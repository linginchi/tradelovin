import type { SupabaseClient } from "@supabase/supabase-js";

import {
	commissionColumnBuy,
	commissionColumnSell,
	estimateBuyFreezeAmount,
	round2,
	round4,
	stampColumnSell,
	totalBuyerCost,
	totalSellerProceeds,
} from "@/lib/trade/fees";
import { getCurrentPrice } from "@/lib/trade/get-current-price";
import { matchLimitAgainstQuote } from "@/lib/trade/match-engine";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import { validateBuyOrder, validateSellOrder } from "@/lib/trade/validate-order-input";

export type PlaceBody = {
	symbolRaw: string;
	limitPrice: number;
	quantity: number;
	side: "buy" | "sell";
};

export type ApiJson = Record<string, unknown>;

function jsonError(error: string, status = 400): { status: number; body: ApiJson } {
	return { status, body: { success: false, error } };
}

async function reloadAccountRow(
	srv: SupabaseClient,
	id: string,
): Promise<{
	id: string;
	current_balance: string | number;
	frozen_balance: string | number;
} | null> {
	const { data, error } = await srv.from("sim_accounts").select("*").eq("id", id).maybeSingle();
	if (error || !data) return null;
	return data as {
		id: string;
		current_balance: string | number;
		frozen_balance: string | number;
	};
}

export async function freezeBuy(srv: SupabaseClient, accountId: string, reservedCash: number) {
	const row = await reloadAccountRow(srv, accountId);
	if (!row) throw new Error("账户不存在");

	const cb = Number(row.current_balance);
	const fb = Number(row.frozen_balance);
	const nextCb = cb - reservedCash;
	const nextFb = fb + reservedCash;
	if (nextCb < -1e-9) throw new Error("可用资金不足");
	const { error } = await srv
		.from("sim_accounts")
		.update({ current_balance: nextCb, frozen_balance: nextFb, updated_at: new Date().toISOString() })
		.eq("id", accountId);
	if (error) throw error;
}

export async function freezeSell(srv: SupabaseClient, accountId: string, symbolUpper: string, qty: number) {
	const { data: pos, error: e0 } = await srv
		.from("sim_positions")
		.select("id,quantity,available_qty,frozen_qty")
		.eq("account_id", accountId)
		.eq("symbol", symbolUpper)
		.maybeSingle();

	if (e0 || !pos) throw new Error("未找到持仓");
	const available = Number((pos as { available_qty: number }).available_qty);
	const frozenQty = Number((pos as { frozen_qty: number }).frozen_qty);
	if (available < qty) throw new Error("可卖数量不足");

	const nuAv = available - qty;
	const nFr = frozenQty + qty;
	const { error } = await srv
		.from("sim_positions")
		.update({
			available_qty: nuAv,
			frozen_qty: nFr,
			updated_at: new Date().toISOString(),
		})
		.eq("id", (pos as { id: string }).id);

	if (error) throw error;
}

/** 撤单时复用解冻逻辑 */
export async function unfreezeBuy(srv: SupabaseClient, accountId: string, reservedCash: number) {
	const row = await reloadAccountRow(srv, accountId);
	if (!row) return;

	const cb = Number(row.current_balance);
	const fb = Number(row.frozen_balance);
	await srv
		.from("sim_accounts")
		.update({
			current_balance: cb + reservedCash,
			frozen_balance: Math.max(0, fb - reservedCash),
			updated_at: new Date().toISOString(),
		})
		.eq("id", accountId);
}

export async function unfreezeSell(srv: SupabaseClient, accountId: string, symbolUpper: string, qty: number) {
	const { data: pos, error } = await srv
		.from("sim_positions")
		.select("id,available_qty,frozen_qty")
		.eq("account_id", accountId)
		.eq("symbol", symbolUpper)
		.maybeSingle();
	if (error || !pos) return;

	const av = Number((pos as { available_qty: number }).available_qty);
	const fr = Number((pos as { frozen_qty: number }).frozen_qty);
	await srv
		.from("sim_positions")
		.update({
			available_qty: av + qty,
			frozen_qty: Math.max(0, fr - qty),
			updated_at: new Date().toISOString(),
		})
		.eq("id", (pos as { id: string }).id);
}

export async function placeLimitOrderService(
	srv: SupabaseClient,
	userId: string,
	body: PlaceBody,
): Promise<{ status: number; body: ApiJson }> {
	const quote = await getCurrentPrice(body.symbolRaw);
	if (!quote) {
		return jsonError("暂时无法获取行情", 503);
	}

	const refPx = quote.price;
	const sym = quote.displaySymbol;
	const qty = Math.trunc(Number(body.quantity));
	const lp = Number(body.limitPrice);

	const { data: accRow, error: accErr } = await getOrCreateSimAccount(srv, userId);
	if (accErr || !accRow) {
		return jsonError("账户不可用", 500);
	}
	const accountId = accRow.id;

	if (body.side === "sell") {
		const { data: pos } = await srv
			.from("sim_positions")
			.select("available_qty,frozen_qty,quantity,name")
			.eq("account_id", accountId)
			.eq("symbol", sym)
			.maybeSingle();

		const avail = pos ? Number((pos as { available_qty: number }).available_qty) : 0;
		const vSell = validateSellOrder({
			availableQty: avail,
			limitPrice: lp,
			quantity: qty,
			referencePrice: refPx,
		});
		if (vSell) return jsonError(vSell);

		try {
			await freezeSell(srv, accountId, sym, qty);
		} catch (e) {
			return jsonError(e instanceof Error ? e.message : "冻结失败");
		}

		let orderId: string;
		try {
			const ins = await srv
				.from("sim_orders")
				.insert({
					account_id: accountId,
					symbol: sym,
					side: "sell",
					price: lp,
					quantity: qty,
					filled_qty: 0,
					status: "pending",
					order_type: "limit",
					reserved_cash: null,
					reserved_shares: qty,
					updated_at: new Date().toISOString(),
				})
				.select("id")
				.single();
			if (ins.error || !ins.data) {
				await unfreezeSell(srv, accountId, sym, qty);
				throw new Error(ins.error?.message ?? "创建委托失败");
			}
			orderId = (ins.data as { id: string }).id;
		} catch (e) {
			await unfreezeSell(srv, accountId, sym, qty);
			return jsonError(e instanceof Error ? e.message : "挂单失败");
		}

		if (!matchLimitAgainstQuote("sell", lp, refPx)) {
			return {
				status: 200,
				body: {
					success: false,
					message: "当前价格无法成交，已挂单",
					data: { orderId, status: "pending", filledQty: 0 },
				},
			};
		}

		try {
			await executeSellFilled(srv, orderId, accountId, sym, qty, refPx);
		} catch (e) {
			return jsonError(e instanceof Error ? e.message : "撮合失败");
		}

		return {
			status: 200,
			body: {
				success: true,
				data: {
					orderId,
					status: "filled",
					filledQty: qty,
					message: "委托已成交",
				},
			},
		};
	}

	/** buy */
	const vBuy = validateBuyOrder({
		account: accRow,
		limitPrice: lp,
		quantity: qty,
		referencePrice: refPx,
	});
	if (vBuy) return jsonError(vBuy);

	const freezeAmt = estimateBuyFreezeAmount(lp, qty);

	try {
		await freezeBuy(srv, accountId, freezeAmt);
	} catch (e) {
		return jsonError(e instanceof Error ? e.message : "冻结失败");
	}

	let orderId: string;
	try {
		const ins = await srv
			.from("sim_orders")
			.insert({
				account_id: accountId,
				symbol: sym,
				side: "buy",
				price: lp,
				quantity: qty,
				filled_qty: 0,
				status: "pending",
				order_type: "limit",
				reserved_cash: freezeAmt,
				reserved_shares: null,
				updated_at: new Date().toISOString(),
			})
			.select("id")
			.single();
		if (ins.error || !ins.data) {
			await unfreezeBuy(srv, accountId, freezeAmt);
			throw new Error(ins.error?.message ?? "创建委托失败");
		}
		orderId = (ins.data as { id: string }).id;
	} catch (e) {
		await unfreezeBuy(srv, accountId, freezeAmt);
		return jsonError(e instanceof Error ? e.message : "挂单失败");
	}

	if (!matchLimitAgainstQuote("buy", lp, refPx)) {
		return {
			status: 200,
			body: {
				success: false,
				message: "当前价格无法成交，已挂单",
				data: { orderId, status: "pending", filledQty: 0 },
			},
		};
	}

	try {
		await executeBuyFilled(srv, accountId, orderId, sym, quote.name, freezeAmt, qty, refPx);
	} catch (e) {
		return jsonError(e instanceof Error ? e.message : "撮合失败");
	}

	return {
		status: 200,
		body: {
			success: true,
			data: {
				orderId,
				status: "filled",
				filledQty: qty,
				message: "委托已成交",
			},
		},
	};
}

async function executeBuyFilled(
	srv: SupabaseClient,
	accountId: string,
	orderId: string,
	displaySymbol: string,
	nameGuess: string | undefined,
	reservedCash: number,
	qty: number,
	execPx: number,
) {
	const totalCost = totalBuyerCost(execPx, qty);

	const row = await reloadAccountRow(srv, accountId);
	if (!row) throw new Error("账户读取失败");

	const cb = Number(row.current_balance);
	const fb = Number(row.frozen_balance);

	const nc = cb + (reservedCash - totalCost);
	const nf = fb - reservedCash;

	if (nf < -1e-9 || nc < -1e-9) throw new Error("资金结算异常");

	const { error: uerr } = await srv
		.from("sim_accounts")
		.update({
			current_balance: nc,
			frozen_balance: nf,
			updated_at: new Date().toISOString(),
		})
		.eq("id", accountId);
	if (uerr) throw uerr;

	const mv = round2(execPx * qty);

	const { data: pos0 } = await srv
		.from("sim_positions")
		.select("*")
		.eq("account_id", accountId)
		.eq("symbol", displaySymbol)
		.maybeSingle();

	if (!pos0) {
		const ins = await srv.from("sim_positions").insert({
			account_id: accountId,
			symbol: displaySymbol,
			name: nameGuess ?? displaySymbol,
			quantity: qty,
			available_qty: qty,
			frozen_qty: 0,
			cost_price: execPx,
			market_value: mv,
			updated_at: new Date().toISOString(),
		});
		if (ins.error) throw ins.error;
	} else {
		const pq = Number((pos0 as { quantity: number }).quantity);
		const oldC = Number((pos0 as { cost_price: number }).cost_price);
		const aq = Number((pos0 as { available_qty: number }).available_qty);
		const avg =
			pq + qty > 0 ? round4((pq * oldC + execPx * qty) / (pq + qty)) : round4(execPx);

		const u = await srv
			.from("sim_positions")
			.update({
				quantity: pq + qty,
				available_qty: aq + qty,
				cost_price: avg,
				market_value: round2(execPx * (pq + qty)),
				updated_at: new Date().toISOString(),
			})
			.eq("id", (pos0 as { id: string }).id);
		if (u.error) throw u.error;
	}

	const ou = await srv
		.from("sim_orders")
		.update({
			filled_qty: qty,
			status: "filled",
			updated_at: new Date().toISOString(),
		})
		.eq("id", orderId);
	if (ou.error) throw ou.error;

	const ti = await srv.from("sim_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol: displaySymbol,
		side: "buy",
		price: execPx,
		quantity: qty,
		commission: commissionColumnBuy(execPx, qty),
		stamp_tax: 0,
		trade_time: new Date().toISOString(),
	});
	if (ti.error) throw ti.error;
}

async function executeSellFilled(
	srv: SupabaseClient,
	orderId: string,
	accountId: string,
	displaySymbol: string,
	qty: number,
	execPx: number,
) {
	const net = totalSellerProceeds(execPx, qty);

	const row = await reloadAccountRow(srv, accountId);
	if (!row) throw new Error("账户读取失败");

	const nc = Number(row.current_balance) + net;

	const ur = await srv
		.from("sim_accounts")
		.update({
			current_balance: nc,
			updated_at: new Date().toISOString(),
		})
		.eq("id", accountId);
	if (ur.error) throw ur.error;

	const { data: pos, error: pe } = await srv
		.from("sim_positions")
		.select("*")
		.eq("account_id", accountId)
		.eq("symbol", displaySymbol)
		.maybeSingle();
	if (pe || !pos) throw new Error("持仓缺失");

	const pid = (pos as { id: string }).id;
	const q0 = Number((pos as { quantity: number }).quantity);
	const fr = Number((pos as { frozen_qty: number }).frozen_qty);
	const qLeft = q0 - qty;
	const frNext = fr - qty;
	if (qLeft < 0 || frNext < -1e-9) throw new Error("持仓数量异常");

	if (qLeft <= 0) {
		const del = await srv.from("sim_positions").delete().eq("id", pid);
		if (del.error) throw del.error;
	} else {
		const u = await srv
			.from("sim_positions")
			.update({
				quantity: qLeft,
				frozen_qty: Math.max(0, frNext),
				market_value: round2(execPx * qLeft),
				updated_at: new Date().toISOString(),
			})
			.eq("id", pid);
		if (u.error) throw u.error;
	}

	const ou = await srv
		.from("sim_orders")
		.update({
			filled_qty: qty,
			status: "filled",
			updated_at: new Date().toISOString(),
		})
		.eq("id", orderId);
	if (ou.error) throw ou.error;

	const ti = await srv.from("sim_trades").insert({
		order_id: orderId,
		account_id: accountId,
		symbol: displaySymbol,
		side: "sell",
		price: execPx,
		quantity: qty,
		commission: commissionColumnSell(execPx, qty),
		stamp_tax: stampColumnSell(execPx, qty),
		trade_time: new Date().toISOString(),
	});
	if (ti.error) throw ti.error;
}
