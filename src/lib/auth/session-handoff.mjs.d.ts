export function sanitizeNextPath(raw: string | null | undefined): string;
export function needsOverseasSessionHandoff(hostname: string | null | undefined): boolean;
export function buildCanonicalHandoffUrl(ticket: string, nextPath: string): string;
