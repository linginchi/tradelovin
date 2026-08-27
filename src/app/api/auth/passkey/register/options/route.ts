import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";

import {
	PASSKEY_RP_NAME,
	asRecord,
	emailByUserId,
	insertPasskeyChallenge,
	jsonPasskeyError,
	loadPasskeyCredentialForUserRp,
	readJsonBody,
	requirePasskeyService,
	resolveRequestRpId,
	userIdBytes,
} from "@/lib/auth/passkey-api";
import { PASSKEY_CHALLENGE_TTL_MS, registrationExcludeCredentials } from "@/lib/auth/passkey";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	const csrf = requireSameOriginForMutation(request);
	if (csrf) return csrf;

	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const rpId = resolveRequestRpId(request);
	if (rpId instanceof NextResponse) return rpId;

	const srv = requirePasskeyService();
	if (srv instanceof NextResponse) return srv;

	const body = asRecord(await readJsonBody(request));
	const replace = body.replace === true;

	const existing = await loadPasskeyCredentialForUserRp(srv, auth.userId, rpId);
	if (existing && !replace) {
		return jsonPasskeyError("already_enrolled", 409);
	}

	const email = await emailByUserId(srv, auth.userId);
	if (!email) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const options = await generateRegistrationOptions({
		rpID: rpId,
		rpName: PASSKEY_RP_NAME,
		userName: email,
		userID: userIdBytes(auth.userId),
		userDisplayName: email,
		timeout: PASSKEY_CHALLENGE_TTL_MS,
		authenticatorSelection: {
			residentKey: "required",
			userVerification: "required",
		},
		excludeCredentials: registrationExcludeCredentials(existing, replace),
	});

	const challengeId = await insertPasskeyChallenge(srv, {
		userId: auth.userId,
		purpose: "register",
		rpId,
		challenge: options.challenge,
	});
	if (!challengeId) {
		return jsonPasskeyError("verify_failed", 500);
	}

	return NextResponse.json({ success: true, challengeId, options });
}
