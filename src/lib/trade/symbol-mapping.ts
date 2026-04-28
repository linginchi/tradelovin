/**
 * 将用户输入转换为新浪行情列表参数（sh600519 / sz000001 / hk00700 等）
 * https://finance.sina.com.cn (list 格式)
 */

export type SinaSymbol = {
	/** hq.sinajs.cn list= 参数 */
	sinaListKey: string;
	/** UI 用大写精简代码 */
	displaySymbol: string;
};

export function mapUserSymbolToSina(raw: string): SinaSymbol | null {
	let s = raw.trim().replace(/\u3000/g, " ");
	if (!s.length) return null;

	const upper = s.toUpperCase();
	// HK.00700
	const hkMarket = /^HK\.?(\d{1,5})$/i.exec(upper);
	if (hkMarket) {
		const hk = hkMarket[1].padStart(5, "0").slice(-5);
		return { sinaListKey: `hk${hk}`, displaySymbol: hk };
	}

	const digits = s.replace(/\D/g, "");
	if (!digits.length) return null;

	// A 股 6 位
	if (digits.length === 6) {
		let prefix: "sh" | "sz";
		if (/^60|^688/.test(digits)) prefix = "sh";
		else if (/^(00|30|301)/.test(digits)) prefix = "sz";
		else if (/^002|^003|^004|^008|^009/.test(digits)) prefix = "sz";
		else prefix = "sz"; // fallback
		return {
			sinaListKey: `${prefix}${digits}`,
			displaySymbol: digits,
		};
	}

	// 港股常用 5 位或简写（腾讯 0700）
	if (digits.length >= 2 && digits.length <= 5) {
		const hk = digits.padStart(5, "0").slice(-5);
		return { sinaListKey: `hk${hk}`, displaySymbol: hk };
	}

	return null;
}
