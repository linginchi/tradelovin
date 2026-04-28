import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateBuyFreezeAmount } from "@/lib/trade/fees";
import { unfreezeBuy, unfreezeSell } from "@/lib/trade/place-limit-order";

type OrderRow = {
	id: string;
	account_id: string;
	symbol: string;
	side: string;
	price: string | number;
	quantity: number;
	status: string;
	reserved_cash: number | string | null;
	reserved_shares: number | null;
};

export type ApiJson = Record<string, unknown>;

function jsonError(error: string, status = 400): { status: number; body: ApiJson } {
	return { status, body: { success: false, error } };
}

export async function cancelLimitOrderService(
	srv: SupabaseClient,
	userId: string,
	orderId: string,
): Promise<{ status: number; body: ApiJson }> {
	const { data: order, error: oe } = await srv
		.from("sim_orders")
		.select(
			"id,account_id,symbol,side,price,quantity,status,reserved_cash,reserved_shares",
		)
		.eq("id", orderId)
		.maybeSingle();

	if (oe || !order) {
		return jsonError("委托不存在", 404);
	}

	const o = order as OrderRow;

	const { data: acc, error: ae } = await srv
		.from("sim_accounts")
		.select("id,user_id")
		.eq("id", o.account_id)
		.maybeSingle();
	if (ae || !acc) {
		return jsonError("账户不存在", 404);
	}
	if ((acc as { user_id: string }).user_id !== userId) {
		return jsonError("无权撤销该委托", 403);
	}

	if (o.status !== "pending") {
		return jsonError("仅支持撤销尚未成交（pending）的委托", 400);
	}

	const sym = (o.symbol as string).trim();
	const qty = Number(o.quantity);

	const sd = String(o.side).trim().toLowerCase();
	if (sd === "buy") {
		const pv = Number(o.price);
		const fallback = estimateBuyFreezeAmount(pv, qty);
		const reserved =
			o.reserved_cash != null && o.reserved_cash !== ""
				? Number(o.reserved_cash)
				: fallback;
		await unfreezeBuy(srv, o.account_id, reserved);
	} else if (sd === "sell") {
		const shares =
			o.reserved_shares != null && !Number.isNaN(Number(o.reserved_shares))
				? Number(o.reserved_shares)
				: qty;
		await unfreezeSell(srv, o.account_id, sym, shares);
	} else {
		return jsonError("委托方向未知", 400);
	}

	const up = await srv
		.from("sim_orders")
		.update({ status: "cancelled", updated_at: new Date().toISOString() })
		.eq("id", orderId);
	if (up.error) {
		return jsonError(up.error.message ?? "更新委托失败");
	}

	return {
		status: 200,
		body: { success: true, data: { orderId, status: "cancelled", message: "已撤单" } },
	};
}
