import { estimateBuyFreezeAmount } from "@/lib/trade/fees";
import { isWithinLimitBand, limitPriceBands } from "@/lib/trade/limits";
import type { SimAccountRow } from "@/lib/trade/sim-account";

export type ValidateOrderBuyParams = {
	account: SimAccountRow;
	limitPrice: number;
	quantity: number;
	referencePrice: number;
};

export type ValidateSellParams = {
	availableQty: number;
	limitPrice: number;
	quantity: number;
	referencePrice: number;
};

/** 买入：资金充足 + 涨跌停 + 手数校验（手数外层已校验） */
export function validateBuyOrder(p: ValidateOrderBuyParams): string | null {
	if (!Number.isFinite(p.quantity) || p.quantity <= 0 || p.quantity % 100 !== 0) {
		return "委托数量须为 100 的整数倍";
	}
	const freezeAmt = estimateBuyFreezeAmount(p.limitPrice, p.quantity);
	const avail = Number(p.account.current_balance);
	if (!Number.isFinite(avail) || avail < freezeAmt - 1e-9) {
		return `可用资金不足（需预留约 ${freezeAmt.toFixed(2)}）`;
	}
	if (!isWithinLimitBand(p.limitPrice, p.referencePrice)) {
		return `委托价超出涨跌停范围（参考价 ±10%）：${referenceRangeHint(p.referencePrice)}`;
	}
	return null;
}

/** 卖出：持仓可卖数量 + 涨跌停 */
export function validateSellOrder(p: ValidateSellParams): string | null {
	if (!Number.isFinite(p.quantity) || p.quantity <= 0 || p.quantity % 100 !== 0) {
		return "委托数量须为 100 的整数倍";
	}
	if (p.availableQty < p.quantity) {
		return "可卖数量不足";
	}
	if (!isWithinLimitBand(p.limitPrice, p.referencePrice)) {
		return `委托价超出涨跌停范围（参考价 ±10%）：${referenceRangeHint(p.referencePrice)}`;
	}
	return null;
}

function referenceRangeHint(referencePrice: number): string {
	const { lower, upper } = limitPriceBands(referencePrice);
	return `${lower} ~ ${upper}`;
}
