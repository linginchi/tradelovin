// src/lib/site-entries.mjs.d.ts
export type SiteEntryRole = "canonical" | "legacy_redirect" | "mainland";
export const SITE_ENTRIES: ReadonlyArray<{ readonly hostname: string; readonly role: SiteEntryRole }>;
export const CANONICAL_OVERSEAS_HOSTNAME: string;
export const MAINLAND_FALLBACK_ORIGIN: string;
export function normalizeHostname(host: string | null | undefined): string;
export function isMainlandEntryHost(hostname: string | null | undefined): boolean;
export function isLegacyOverseasHost(hostname: string | null | undefined): boolean;
export function isCanonicalOverseasHost(hostname: string | null | undefined): boolean;
export function isHttpsOnlyHost(hostname: string | null | undefined): boolean;
export function getMagicLinkAllowedHosts(): string[];
