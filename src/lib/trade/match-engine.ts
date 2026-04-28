/** 限价单与快照行情是否可一次性全部成交（全报全撤模式：不成则挂单） */

export function matchLimitAgainstQuote(side: "buy" | "sell", limitPrice: number, marketPrice: number): boolean {
	return side === "buy" ? marketPrice <= limitPrice : marketPrice >= limitPrice;
}
