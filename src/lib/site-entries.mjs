// src/lib/site-entries.mjs
export const CANONICAL_OVERSEAS_HOSTNAME = "leolearnstotrade.com";
export const MAINLAND_FALLBACK_ORIGIN = "https://xeoaxis.com";

export const SITE_ENTRIES = Object.freeze([
	{ hostname: "leolearnstotrade.com", role: "canonical" },
	{ hostname: "www.leolearnstotrade.com", role: "canonical" },
	{ hostname: "tradelovin.com", role: "legacy_redirect" },
	{ hostname: "www.tradelovin.com", role: "legacy_redirect" },
	{ hostname: "xeoaxis.com", role: "mainland" },
	{ hostname: "www.xeoaxis.com", role: "mainland" },
]);

export function normalizeHostname(host) {
	return String(host ?? "")
		.trim()
		.toLowerCase()
		.split(":")[0];
}

function roleOf(hostname) {
	const host = normalizeHostname(hostname);
	return SITE_ENTRIES.find((e) => e.hostname === host)?.role ?? null;
}

export function isMainlandEntryHost(hostname) {
	return roleOf(hostname) === "mainland";
}

export function isLegacyOverseasHost(hostname) {
	return roleOf(hostname) === "legacy_redirect";
}

export function isCanonicalOverseasHost(hostname) {
	return roleOf(hostname) === "canonical";
}

export function isHttpsOnlyHost(hostname) {
	const host = normalizeHostname(hostname);
	if (!host) return false;
	const roots = ["xeoaxis.com", "tradelovin.com", "leolearnstotrade.com"];
	return roots.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function getMagicLinkAllowedHosts() {
	return SITE_ENTRIES.map((e) => e.hostname);
}
