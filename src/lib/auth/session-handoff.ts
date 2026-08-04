export type SessionHandoffPayload = {
	accessToken: string;
	refreshToken: string;
	nextPath: string;
};

export {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
	signSessionHandoff,
	verifySessionHandoff,
} from "@/lib/auth/session-handoff.mjs";
