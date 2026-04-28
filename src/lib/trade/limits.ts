/** 相对参考价允许的涨跌停比例（占位：A 股 ±10%） */
export const LIMIT_BAND_RATIO = 0.1;

export function limitPriceBands(referencePrice: number): { lower: number; upper: number } {
	if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
		return { lower: 0, upper: Infinity };
	}
	const r = referencePrice;
	return {
		lower: Math.round(r * (1 - LIMIT_BAND_RATIO) * 10000) / 10000,
		upper: Math.round(r * (1 + LIMIT_BAND_RATIO) * 10000) / 10000,
	};
}

export function isWithinLimitBand(orderPrice: number, referencePrice: number): boolean {
	const { lower, upper } = limitPriceBands(referencePrice);
	return orderPrice >= lower && orderPrice <= upper;
}
