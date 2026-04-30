export type InstrumentType = "stock" | "etf" | "cbond";

export type InstrumentRule = {
	instrument: InstrumentType;
	label: string;
	lotSize: number;
	limitBandRatio: number;
	stampTaxSellRatio: number;
	minCommission: number;
};

export const INSTRUMENT_RULES: Record<InstrumentType, InstrumentRule> = {
	stock: {
		instrument: "stock",
		label: "A股股票",
		lotSize: 100,
		limitBandRatio: 0.1,
		stampTaxSellRatio: 0.001,
		minCommission: 5,
	},
	etf: {
		instrument: "etf",
		label: "ETF",
		lotSize: 100,
		limitBandRatio: 0.1,
		stampTaxSellRatio: 0,
		minCommission: 5,
	},
	cbond: {
		instrument: "cbond",
		label: "可转债",
		lotSize: 10,
		limitBandRatio: 0.2,
		stampTaxSellRatio: 0,
		minCommission: 1,
	},
};

const ETF_PREFIXES = ["510", "511", "512", "513", "515", "516", "517", "518", "588", "159"];
const CBOND_PREFIXES = ["110", "111", "113", "118", "123", "127", "128"];

export function detectInstrumentType(symbolRaw: string): InstrumentType {
	const digits = symbolRaw.replace(/\D/g, "");
	if (!digits.length) return "stock";
	if (CBOND_PREFIXES.some((p) => digits.startsWith(p))) return "cbond";
	if (ETF_PREFIXES.some((p) => digits.startsWith(p))) return "etf";
	return "stock";
}

export function getInstrumentRule(symbolRaw: string): InstrumentRule {
	return INSTRUMENT_RULES[detectInstrumentType(symbolRaw)];
}

export type RiskGuardConfig = {
	maxOrderNotional: number;
	maxDailyLossPct: number;
	consecutiveLossCooldown: number;
};

export const DEFAULT_RISK_GUARD: RiskGuardConfig = {
	maxOrderNotional: 200000,
	maxDailyLossPct: 0.08,
	consecutiveLossCooldown: 3,
};
