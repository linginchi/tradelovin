export type SessionHandoffPayload = {
	accessToken: string;
	refreshToken: string;
	nextPath: string;
};

export function sanitizeNextPath(raw: string | null | undefined): string;
export function needsOverseasSessionHandoff(hostname: string | null | undefined): boolean;
export function buildCanonicalHandoffUrl(ticket: string, nextPath: string): string;
export function signSessionHandoff(payload: SessionHandoffPayload): Promise<string>;
export function verifySessionHandoff(ticket: string): Promise<SessionHandoffPayload>;
