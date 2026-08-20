const LAST_FAILURE_LIMIT = 8;

export type TradeFeedbackFailure = {
	at: string;
	message: string;
};

export type TradeFeedbackOrderSnapshot = {
	symbol: string;
	side: string;
	status: string;
	reject_reason: string | null;
};

export type TradeFeedbackSnapshotInput = {
	pathname: string;
	symbol: string;
	positionMode: string;
	accountType: string;
	qty: string;
	price: string;
	fetchError: string;
	plan: string;
	membershipStatus: string;
	longQuota: number;
	shortQuota: number;
	recentOrders: TradeFeedbackOrderSnapshot[];
};

const recentFailures: TradeFeedbackFailure[] = [];

export function recordTradeFailure(message: string): void {
	const trimmed = message.trim();
	if (!trimmed) return;
	recentFailures.unshift({ at: new Date().toISOString(), message: trimmed });
	if (recentFailures.length > LAST_FAILURE_LIMIT) {
		recentFailures.length = LAST_FAILURE_LIMIT;
	}
}

export function getRecentTradeFailures(): TradeFeedbackFailure[] {
	return [...recentFailures];
}

export function buildTradeFeedbackDiagnostics(input: TradeFeedbackSnapshotInput): string {
	const href = typeof window === "undefined" ? input.pathname : window.location.href;
	const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
	const failures = getRecentTradeFailures();
	const latestRejected = input.recentOrders.find((row) => row.status === "rejected") ?? null;
	return [
		"=== 自动诊断（请勿删除，便于定位）===",
		`time: ${new Date().toISOString()}`,
		`path: ${input.pathname}`,
		`href: ${href}`,
		`symbol: ${input.symbol || "(empty)"}`,
		`positionMode: ${input.positionMode}`,
		`accountType: ${input.accountType}`,
		`qty: ${input.qty}`,
		`price: ${input.price || "(empty)"}`,
		`plan: ${input.plan || "(unknown)"}`,
		`membershipStatus: ${input.membershipStatus || "(unknown)"}`,
		`personalLongQuota: ${input.longQuota}`,
		`personalShortQuota: ${input.shortQuota}`,
		`fetchError: ${input.fetchError || "(none)"}`,
		`latestRejected: ${latestRejected ? `${latestRejected.symbol} ${latestRejected.side} ${latestRejected.reject_reason ?? ""}` : "(none)"}`,
		`recentOrders: ${JSON.stringify(input.recentOrders.slice(0, 5))}`,
		`recentFailures: ${JSON.stringify(failures)}`,
		`userAgent: ${userAgent}`,
		"=== 以上为自动填写 ===",
	].join("\n");
}
