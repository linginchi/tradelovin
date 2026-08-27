import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";

import {
	insertPasskeyChallenge,
	jsonPasskeyError,
	requirePasskeyService,
	resolveRequestRpId,
} from "@/lib/auth/passkey-api";
import { PASSKEY_CHALLENGE_TTL_MS } from "@/lib/auth/passkey";
import { requireSameOriginForMutation } from "@/lib/security/csrf";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	const csrf = requireSameOriginForMutation(request);
	if (csrf) return csrf;

	const rpId = resolveRequestRpId(request);
	if (rpId instanceof NextResponse) return rpId;

	const srv = requirePasskeyService();
	if (srv instanceof NextResponse) return srv;

	const options = await generateAuthenticationOptions({
		rpID: rpId,
		allowCredentials: [],
		userVerification: "required",
		timeout: PASSKEY_CHALLENGE_TTL_MS,
	});

	const challengeId = await insertPasskeyChallenge(srv, {
		userId: null,
		purpose: "login",
		rpId,
		challenge: options.challenge,
	});
	if (!challengeId) {
		return jsonPasskeyError("verify_failed", 500);
	}

	return NextResponse.json({ success: true, challengeId, options });
}
