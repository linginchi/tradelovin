/** 相对参考价允许的涨跌停比例（默认：A 股股票/ETF ±10%） */
export const LIMIT_BAND_RATIO = 0.1;

export function limitPriceBands(
	referencePrice: number,
	ratio = LIMIT_BAND_RATIO,
): { lower: number; upper: number } {
	if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
		return { lower: 0, upper: Infinity };
	}
	const r = referencePrice;
	return {
		lower: Math.round(r * (1 - ratio) * 10000) / 10000,
		upper: Math.round(r * (1 + ratio) * 10000) / 10000,
	};
}

export function isWithinLimitBand(orderPrice: number, referencePrice: number, ratio = LIMIT_BAND_RATIO): boolean {
	const { lower, upper } = limitPriceBands(referencePrice, ratio);
	return orderPrice >= lower && orderPrice <= upper;
}
