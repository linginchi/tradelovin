/** 佣金 0.025%，最低 5 元 */
export function brokerageFee(turnover: number): number {
	return Math.max(5, round2(turnover * 0.00025));
}

/** 过户费（单边 0.001%，「双边」合计 0.002%）— 买入/卖出各收一笔 */
export function transferFeeOneSide(turnover: number): number {
	return round2(turnover * 0.00001);
}

/** 印花税：仅卖出 0.1% */
export function stampTaxSell(turnover: number): number {
	return round2(turnover * 0.001);
}

export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
	return Math.round(n * 10000) / 10000;
}

/** 买入冻结估计：金额 + 佣金(最低5) + 单边过户费 */
export function estimateBuyFreezeAmount(limitPrice: number, quantity: number): number {
	const turnover = limitPrice * quantity;
	const broker = brokerageFee(turnover);
	const xfer = transferFeeOneSide(turnover);
	return round2(turnover + broker + xfer);
}

/** 成交时买方总支出（现价成交）— 印花税 0 */
export function totalBuyerCost(executionPrice: number, quantity: number): number {
	const turnover = executionPrice * quantity;
	const broker = brokerageFee(turnover);
	const xfer = transferFeeOneSide(turnover);
	return round2(turnover + broker + xfer);
}

/** 卖方税后收入 */
export function totalSellerProceeds(executionPrice: number, quantity: number): number {
	const turnover = executionPrice * quantity;
	const broker = brokerageFee(turnover);
	const xfer = transferFeeOneSide(turnover);
	const stamp = stampTaxSell(turnover);
	return round2(turnover - broker - xfer - stamp);
}

/** commission 字段：佣金+过户单边（印花税单独） */
export function commissionColumnBuy(executionPrice: number, quantity: number): number {
	const turnover = executionPrice * quantity;
	return round4(brokerageFee(turnover) + transferFeeOneSide(turnover));
}

export function commissionColumnSell(executionPrice: number, quantity: number): number {
	const turnover = executionPrice * quantity;
	return round4(brokerageFee(turnover) + transferFeeOneSide(turnover));
}

export function stampColumnSell(executionPrice: number, quantity: number): number {
	return round4(stampTaxSell(executionPrice * quantity));
}
