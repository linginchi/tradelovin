import {
	CANONICAL_OVERSEAS_HOSTNAME,
	isLegacyOverseasHost,
	isMainlandEntryHost,
	normalizeHostname,
} from "../site-entries.mjs";

export function sanitizeNextPath(raw) {
	if (raw && String(raw).startsWith("/") && !String(raw).startsWith("//")) return String(raw);
	return "/my-learning";
}

/**
 * Legacy overseas hosts 308 HTML pages to the canonical domain, so auth cookies
 * set on tradelovin.com never reach leolearnstotrade.com. After a successful
 * login on a legacy host we mint a short-lived handoff ticket and finish the
 * session on the canonical host instead.
 */
export function needsOverseasSessionHandoff(hostname) {
	const host = normalizeHostname(hostname);
	if (!host) return false;
	if (isMainlandEntryHost(host)) return false;
	return isLegacyOverseasHost(host);
}

export function buildCanonicalHandoffUrl(ticket, nextPath) {
	const url = new URL(`https://${CANONICAL_OVERSEAS_HOSTNAME}/auth/handoff`);
	url.searchParams.set("ticket", ticket);
	url.searchParams.set("next", sanitizeNextPath(nextPath));
	return url.toString();
}
