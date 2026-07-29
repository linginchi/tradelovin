import { CANONICAL_OVERSEAS_HOSTNAME, isLegacyOverseasHost } from "../site-entries.mjs";

export function buildLegacyOverseasRedirectUrl({ hostname, href }) {
	if (!isLegacyOverseasHost(hostname)) return null;
	const url = new URL(href);
	url.protocol = "https:";
	url.host = CANONICAL_OVERSEAS_HOSTNAME;
	return url.toString();
}
