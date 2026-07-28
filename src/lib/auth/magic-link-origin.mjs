/**
 * Resolve the public origin used in emailed magic-login links.
 *
 * Prefer the browser-facing Host/Origin when it is an allowlisted production
 * entry (especially mainland xeoaxis.com). A global MAGIC_LINK_ORIGIN secret
 * set to the overseas canonical domain must not force mainland users onto a
 * host they cannot open.
 */

export const MAGIC_LINK_ALLOWED_HOSTS = [
	"xeoaxis.com",
	"www.xeoaxis.com",
	"tradelovin.com",
	"www.tradelovin.com",
	"leolearnstotrade.com",
	"www.leolearnstotrade.com",
];

function normalizeOrigin(value) {
	const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function hostnameOf(originOrHost) {
	const raw = String(originOrHost ?? "").trim();
	if (!raw) return "";
	try {
		const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
		return url.hostname.toLowerCase();
	} catch {
		return "";
	}
}

export function isAllowedMagicLinkHost(hostname) {
	const host = String(hostname ?? "")
		.trim()
		.toLowerCase()
		.split(":")[0];
	return MAGIC_LINK_ALLOWED_HOSTS.includes(host);
}

/**
 * @param {{
 *   requestUrl?: string,
 *   originHeader?: string | null,
 *   forwardedHost?: string | null,
 *   hostHeader?: string | null,
 *   envOrigin?: string | null,
 *   fallbackOrigin?: string,
 * }} input
 */
export function resolveMagicLinkBaseUrl({
	requestUrl = "https://xeoaxis.com/",
	originHeader = null,
	forwardedHost = null,
	hostHeader = null,
	envOrigin = null,
	fallbackOrigin = "https://xeoaxis.com",
} = {}) {
	const candidates = [];

	if (originHeader) candidates.push(originHeader);
	if (forwardedHost) candidates.push(forwardedHost.split(",")[0]?.trim());
	if (hostHeader) candidates.push(hostHeader.split(",")[0]?.trim());

	try {
		candidates.push(new URL(requestUrl).host);
	} catch {
		/* ignore */
	}

	for (const candidate of candidates) {
		const host = hostnameOf(candidate);
		if (!isAllowedMagicLinkHost(host)) continue;
		return normalizeOrigin(host.startsWith("http") ? candidate : `https://${host}`);
	}

	const fromEnv = normalizeOrigin(envOrigin);
	if (fromEnv && isAllowedMagicLinkHost(hostnameOf(fromEnv))) {
		return fromEnv;
	}

	return normalizeOrigin(fallbackOrigin) || "https://xeoaxis.com";
}
