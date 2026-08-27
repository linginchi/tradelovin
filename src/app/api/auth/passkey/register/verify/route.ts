import {
	verifyRegistrationResponse,
	type AuthenticatorTransportFuture,
	type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";

import {
	asRecord,
	consumePasskeyChallenge,
	decodeBytea,
	deviceLabelFromRequest,
	encodeBytea,
	jsonPasskeyError,
	loadPasskeyChallenge,
	readJsonBody,
	requestOrigin,
	requirePasskeyService,
	resolveRequestRpId,
} from "@/lib/auth/passkey-api";
import { isChallengeOpen, passkeyOriginAllowed } from "@/lib/auth/passkey";
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

	const origin = requestOrigin(request);
	if (!passkeyOriginAllowed(origin, rpId)) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const srv = requirePasskeyService();
	if (srv instanceof NextResponse) return srv;

	const body = asRecord(await readJsonBody(request));
	const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
	const credential = body.credential;
	if (!challengeId || !credential || typeof credential !== "object") {
		return jsonPasskeyError("verify_failed", 400);
	}

	const challenge = await loadPasskeyChallenge(srv, challengeId);
	if (!challenge || !isChallengeOpen(challenge, Date.now())) {
		return jsonPasskeyError("challenge_expired", 400);
	}
	if (challenge.purpose !== "register" || challenge.user_id !== auth.userId || challenge.rp_id !== rpId) {
		return jsonPasskeyError("verify_failed", 400);
	}

	let verified;
	try {
		verified = await verifyRegistrationResponse({
			response: credential as RegistrationResponseJSON,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpId,
			requireUserVerification: true,
		});
	} catch (error) {
		console.error("[passkey register/verify]", error instanceof Error ? error.message : "verify threw");
		return jsonPasskeyError("verify_failed", 400);
	}

	if (!verified.verified || !verified.registrationInfo) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const cred = verified.registrationInfo.credential;
	const publicKey =
		cred.publicKey instanceof Uint8Array ? new Uint8Array(cred.publicKey) : decodeBytea(cred.publicKey);
	if (!publicKey) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const consumed = await consumePasskeyChallenge(srv, challengeId);
	if (!consumed) {
		return jsonPasskeyError("challenge_expired", 400);
	}

	const { error: upsertErr } = await srv.from("user_passkey_credentials").upsert(
		{
			user_id: auth.userId,
			rp_id: rpId,
			credential_id: cred.id,
			public_key: encodeBytea(publicKey),
			sign_count: cred.counter,
			transports: (cred.transports ?? null) as AuthenticatorTransportFuture[] | null,
			device_label: deviceLabelFromRequest(request),
		},
		{ onConflict: "user_id,rp_id" },
	);
	if (upsertErr) {
		console.error("[passkey register/verify upsert]", upsertErr.message);
		return jsonPasskeyError("verify_failed", 500);
	}

	return NextResponse.json({ success: true, enrolled: true, rpId });
}
