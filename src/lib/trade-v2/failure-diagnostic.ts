import { resolveFailureSymbol, type FailureMeta } from "@/lib/trade-v2/failure-priority";

export type FailureDiagnosticSignal = {
	code?: string | null;
	content?: string;
	createdAt?: string;
	meta?: FailureMeta;
};

export function formatFailureDiagnostic(
	signal: FailureDiagnosticSignal,
	options?: {
		timeFormatter?: (iso: string) => string;
		fallbackCode?: string;
	},
): string {
	const code = String(signal.code ?? options?.fallbackCode ?? "RISK");
	const symbol = resolveFailureSymbol({ content: signal.content, meta: signal.meta }) || "UNKNOWN";
	const rawTime = String(signal.createdAt ?? "");
	const time = rawTime
		? (options?.timeFormatter ? options.timeFormatter(rawTime) : new Date(rawTime).toLocaleString())
		: "UNKNOWN_TIME";
	const tier = signal.meta?.executionTier ? ` | tier=${signal.meta.executionTier}` : "";
	const liq =
		typeof signal.meta?.liquidityScore === "number" ? ` | liq=${signal.meta.liquidityScore.toFixed(2)}` : "";
	const gap = typeof signal.meta?.priceGapBps === "number" ? ` | gapBps=${signal.meta.priceGapBps}` : "";
	const detail = String(signal.content ?? "");
	return `code=${code} | symbol=${symbol} | time=${time}${tier}${liq}${gap} | detail=${detail}`;
}
