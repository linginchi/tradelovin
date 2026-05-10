import type { SupabaseClient } from "@supabase/supabase-js";

import { getMarketQuote } from "@/lib/market/market-domain";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import type { TradeV2ForceCloseSummary } from "@/lib/trade-v2/api-types";

type JobScope = "self" | "all";
type TriggerSource = "manual" | "cron";

type TqAccountRow = {
	id: string;
	user_id: string;
};

type TqPositionRow = {
	id: string;
	account_id: string;
	symbol: string;
	position_type: "long" | "short";
	quantity: number;
	available_qty: number;
};

type TqShortLoanRow = {
	id: string;
	remaining_qty: number;
};

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

async function closeShortLoans(
	supabase: SupabaseClient,
	accountId: string,
	symbol: string,
	qty: number,
): Promise<void> {
	const normalizedSymbol = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalizedSymbol)) {
		throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	}
	let remain = qty;
	const { data, error } = await supabase
		.from("tq_short_loans")
		.select("id,remaining_qty")
		.eq("account_id", accountId)
		.eq("symbol", normalizedSymbol)
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
}

async function forceCloseOnePosition(
	supabase: SupabaseClient,
	jobId: string,
	accountId: string,
	position: TqPositionRow,
): Promise<{ status: "success" | "failed" | "skipped"; message?: string }> {
	const symbol = normalizeCnSymbol(position.symbol);
	if (!isCanonicalCnSymbol(symbol)) {
		return { status: "failed", message: `${SYMBOL_FORMAT_ERROR_MESSAGE}（${position.symbol}）` };
	}
	const qty = Number(position.quantity);
	if (qty <= 0) {
		return { status: "skipped", message: "仓位数量为0，跳过" };
	}

	const quote = await getMarketQuote(symbol);
	if (!quote) {
		return { status: "failed", message: "行情不可用，无法强平" };
	}
	const execPrice = quote.price;

	const { data: accountRow, error: accountErr } = await supabase
		.from("tq_product_accounts")
		.select("id,available_balance")
		.eq("id", accountId)
		.maybeSingle();
	if (accountErr || !accountRow) {
		return { status: "failed", message: accountErr?.message ?? "账户不存在" };
	}

	const available = Number((accountRow as { available_balance: string | number }).available_balance);
	if (position.position_type === "long") {
		const proceeds = round2(execPrice * qty);
		const { error: updateAccErr } = await supabase
			.from("tq_product_accounts")
			.update({ available_balance: round2(available + proceeds) })
			.eq("id", accountId);
		if (updateAccErr) return { status: "failed", message: updateAccErr.message };

		const { error: tradeErr } = await supabase.from("tq_trades").insert({
			order_id: null,
			account_id: accountId,
			symbol,
			side: "sell",
			price: execPrice,
			quantity: qty,
		});
		if (tradeErr) return { status: "failed", message: tradeErr.message };
	} else {
		const cost = round2(execPrice * qty);
		if (available < cost) {
			return { status: "failed", message: "账户可用资金不足，空仓回补失败" };
		}
		const { error: updateAccErr } = await supabase
			.from("tq_product_accounts")
			.update({ available_balance: round2(available - cost) })
			.eq("id", accountId);
		if (updateAccErr) return { status: "failed", message: updateAccErr.message };

		await closeShortLoans(supabase, accountId, symbol, qty);
		const { error: tradeErr } = await supabase.from("tq_trades").insert({
			order_id: null,
			account_id: accountId,
			symbol,
			side: "buy",
			price: execPrice,
			quantity: qty,
		});
		if (tradeErr) return { status: "failed", message: tradeErr.message };
	}

	const { error: deletePosErr } = await supabase.from("tq_positions").delete().eq("id", position.id);
	if (deletePosErr) return { status: "failed", message: deletePosErr.message };

	const { error: eventErr } = await supabase.from("tq_force_close_events").insert({
		job_id: jobId,
		account_id: accountId,
		symbol,
		position_type: position.position_type,
		quantity: qty,
		price: execPrice,
		status: "success",
		message: "强平成功",
	});
	if (eventErr) {
		return { status: "failed", message: eventErr.message };
	}

	return { status: "success" };
}

export async function runForceCloseJob(
	supabase: SupabaseClient,
	params: { scope: JobScope; triggerSource: TriggerSource; triggeredBy: string | null },
): Promise<TradeV2ForceCloseSummary> {
	const { data: job, error: jobErr } = await supabase
		.from("tq_force_close_jobs")
		.insert({
			scope: params.scope,
			trigger_source: params.triggerSource,
			triggered_by: params.triggeredBy,
			status: "running",
		})
		.select("id")
		.single();
	if (jobErr || !job) {
		throw new Error(jobErr?.message ?? "创建强平任务失败");
	}
	const jobId = (job as { id: string }).id;

	try {
		let accountsQuery = supabase
			.from("tq_product_accounts")
			.select("id,user_id")
			.in("status", ["active"]);
		if (params.scope === "self" && params.triggeredBy) {
			accountsQuery = accountsQuery.eq("user_id", params.triggeredBy);
		}

		const { data: accounts, error: accountsErr } = await accountsQuery;
		if (accountsErr) throw new Error(accountsErr.message);

		let total = 0;
		let success = 0;
		let failed = 0;

		for (const account of (accounts ?? []) as TqAccountRow[]) {
			const { data: positions, error: posErr } = await supabase
				.from("tq_positions")
				.select("*")
				.eq("account_id", account.id)
				.gt("quantity", 0);
			if (posErr) throw new Error(posErr.message);

			for (const pos of (positions ?? []) as TqPositionRow[]) {
				total += 1;
				const result = await forceCloseOnePosition(supabase, jobId, account.id, pos);
				if (result.status === "success") {
					success += 1;
				} else if (result.status === "failed") {
					failed += 1;
					const fallbackSymbol = normalizeCnSymbol(pos.symbol);
					await supabase.from("tq_force_close_events").insert({
						job_id: jobId,
						account_id: account.id,
						symbol: isCanonicalCnSymbol(fallbackSymbol) ? fallbackSymbol : pos.symbol,
						position_type: pos.position_type,
						quantity: Number(pos.quantity),
						price: null,
						status: "failed",
						message: result.message ?? "未知错误",
					});
				}
			}
		}

		await supabase
			.from("tq_force_close_jobs")
			.update({
				status: "completed",
				summary: { total, success, failed },
				completed_at: new Date().toISOString(),
			})
			.eq("id", jobId);

		return { jobId, total, success, failed };
	} catch (error) {
		await supabase
			.from("tq_force_close_jobs")
			.update({
				status: "failed",
				error_message: error instanceof Error ? error.message : "未知错误",
				completed_at: new Date().toISOString(),
			})
			.eq("id", jobId);
		throw error;
	}
}
