import { estimateBuyFreezeAmount } from "@/lib/trade/fees";
import { DEFAULT_RISK_GUARD, getInstrumentRule } from "@/lib/trade/instrument-rules";
import { isWithinLimitBand, limitPriceBands } from "@/lib/trade/limits";
import type { SimAccountRow } from "@/lib/trade/sim-account";

export type ValidateOrderBuyParams = {
	account: SimAccountRow;
	symbolRaw: string;
	limitPrice: number;
	quantity: number;
	referencePrice: number;
};

export type ValidateSellParams = {
	symbolRaw: string;
	availableQty: number;
	limitPrice: number;
	quantity: number;
	referencePrice: number;
};

/** 买入：资金充足 + 涨跌停 + 手数校验（手数外层已校验） */
export function validateBuyOrder(p: ValidateOrderBuyParams): string | null {
	const rule = getInstrumentRule(p.symbolRaw);
	if (!Number.isFinite(p.quantity) || p.quantity <= 0 || p.quantity % rule.lotSize !== 0) {
		return `委托数量须为 ${rule.lotSize} 的整数倍`;
	}
	if (p.limitPrice * p.quantity > DEFAULT_RISK_GUARD.maxOrderNotional) {
		return `单笔名义金额不可超过 ${DEFAULT_RISK_GUARD.maxOrderNotional.toLocaleString()} 元`;
	}
	const freezeAmt = estimateBuyFreezeAmount(p.limitPrice, p.quantity, rule);
	const avail = Number(p.account.current_balance);
	if (!Number.isFinite(avail) || avail < freezeAmt - 1e-9) {
		return `可用资金不足（需预留约 ${freezeAmt.toFixed(2)}）`;
	}
	if (!isWithinLimitBand(p.limitPrice, p.referencePrice, rule.limitBandRatio)) {
		return `委托价超出涨跌停范围（参考价 ±${(rule.limitBandRatio * 100).toFixed(0)}%）：${referenceRangeHint(p.referencePrice, rule.limitBandRatio)}`;
	}
	return null;
}

/** 卖出：持仓可卖数量 + 涨跌停 */
export function validateSellOrder(p: ValidateSellParams): string | null {
	const rule = getInstrumentRule(p.symbolRaw);
	if (!Number.isFinite(p.quantity) || p.quantity <= 0 || p.quantity % rule.lotSize !== 0) {
		return `委托数量须为 ${rule.lotSize} 的整数倍`;
	}
	if (p.availableQty < p.quantity) {
		return "可卖数量不足";
	}
	if (p.limitPrice * p.quantity > DEFAULT_RISK_GUARD.maxOrderNotional) {
		return `单笔名义金额不可超过 ${DEFAULT_RISK_GUARD.maxOrderNotional.toLocaleString()} 元`;
	}
	if (!isWithinLimitBand(p.limitPrice, p.referencePrice, rule.limitBandRatio)) {
		return `委托价超出涨跌停范围（参考价 ±${(rule.limitBandRatio * 100).toFixed(0)}%）：${referenceRangeHint(p.referencePrice, rule.limitBandRatio)}`;
	}
	return null;
}

function referenceRangeHint(referencePrice: number, ratio: number): string {
	const { lower, upper } = limitPriceBands(referencePrice, ratio);
	return `${lower} ~ ${upper}`;
}
