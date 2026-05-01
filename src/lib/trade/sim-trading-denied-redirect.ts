/** 权限不足时不要跳转到「学习与成绩」（易与底部导航误判）；统一去会员页处理升级。 */

export type SimTradingDenialReason = "TRIAL_EXPIRED" | "MEMBERSHIP_FORBIDDEN";

export function buildSimTradingDeniedRedirectHref(code?: string): string {
	const reason: SimTradingDenialReason =
		code === "TRIAL_EXPIRED" || code === "MEMBERSHIP_FORBIDDEN" ? code : "MEMBERSHIP_FORBIDDEN";

	return `/membership?from=trade&reason=${encodeURIComponent(reason)}`;
}
