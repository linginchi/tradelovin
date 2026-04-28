import type { SupabaseClient } from "@supabase/supabase-js";

import { freezeBuy, freezeSell, unfreezeBuy, unfreezeSell } from "@/lib/trade/place-limit-order";

/** 下单时冻结资金或可卖股（与 `place-limit-order` 内逻辑一致，供复用与单测）。 */
export async function freezeFundsOrPosition(
	supabase: SupabaseClient,
	input:
		| { kind: "buy"; accountId: string; reserveCash: number }
		| { kind: "sell"; accountId: string; symbolUpper: string; quantity: number },
) {
	return input.kind === "buy"
		? freezeBuy(supabase, input.accountId, input.reserveCash)
		: freezeSell(supabase, input.accountId, input.symbolUpper, input.quantity);
}

/** 撤单解冻（委托未成交时使用）。 */
export async function unfreezeOnCancel(
	supabase: SupabaseClient,
	input:
		| { kind: "buy"; accountId: string; reservedCash: number }
		| { kind: "sell"; accountId: string; symbolUpper: string; shares: number },
) {
	return input.kind === "buy"
		? unfreezeBuy(supabase, input.accountId, input.reservedCash)
		: unfreezeSell(supabase, input.accountId, input.symbolUpper, input.shares);
}
