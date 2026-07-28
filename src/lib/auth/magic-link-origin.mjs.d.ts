export const MAGIC_LINK_ALLOWED_HOSTS: string[];

export function isAllowedMagicLinkHost(hostname: string | null | undefined): boolean;

export function resolveMagicLinkBaseUrl(input?: {
	requestUrl?: string;
	originHeader?: string | null;
	forwardedHost?: string | null;
	hostHeader?: string | null;
	envOrigin?: string | null;
	fallbackOrigin?: string;
}): string;
