import {
	verifyAuthenticationResponse,
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";

import { establishMagicLinkSession } from "@/lib/auth/magic-link";
import {
	isChallengeOpen,
	isSignCountValid,
	passkeyOriginAllowed,
} from "@/lib/auth/passkey";
import {
	asRecord,
	casUpdatePasskeySignCount,
	consumePasskeyChallenge,
	decodeBytea,
	emailByUserId,
	jsonPasskeyError,
	loadPasskeyChallenge,
	loadPasskeyCredentialById,
	readJsonBody,
	requestOrigin,
	requirePasskeyService,
	resolveRequestRpId,
} from "@/lib/auth/passkey-api";
import {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
	signSessionHandoff,
} from "@/lib/auth/session-handoff";
import { requireSameOriginForMutation } from "@/lib/security/csrf";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	const csrf = requireSameOriginForMutation(request);
	if (csrf) return csrf;

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
	if (challenge.purpose !== "login" || challenge.rp_id !== rpId) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const assertion = credential as AuthenticationResponseJSON;
	const credentialId = typeof assertion.id === "string" ? assertion.id : "";
	if (!credentialId) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const stored = await loadPasskeyCredentialById(srv, credentialId);
	if (!stored || stored.rp_id !== rpId) {
		return jsonPasskeyError("not_enrolled", 400);
	}

	const publicKey = decodeBytea(stored.public_key);
	if (!publicKey) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const storedCount = Number(stored.sign_count);
	let verified;
	try {
		verified = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpId,
			requireUserVerification: true,
			credential: {
				id: stored.credential_id,
				publicKey,
				counter: Number.isFinite(storedCount) ? storedCount : 0,
				transports: (stored.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
			},
		});
	} catch (error) {
		console.error("[passkey login/verify]", error instanceof Error ? error.message : "verify threw");
		return jsonPasskeyError("verify_failed", 400);
	}

	if (!verified.verified) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const incomingCount = verified.authenticationInfo.newCounter;
	const storedCountSafe = Number.isFinite(storedCount) ? storedCount : 0;
	if (!isSignCountValid(storedCountSafe, incomingCount)) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const consumed = await consumePasskeyChallenge(srv, challengeId);
	if (!consumed) {
		return jsonPasskeyError("challenge_expired", 400);
	}

	const bumped = await casUpdatePasskeySignCount(srv, stored.id, storedCountSafe, incomingCount);
	if (!bumped) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const emailLower = await emailByUserId(srv, stored.user_id);
	if (!emailLower) {
		return jsonPasskeyError("verify_failed", 400);
	}

	const redirectTo = sanitizeNextPath(typeof body.next === "string" ? body.next : null);
	const response = NextResponse.json({ success: true, redirectTo });
	const signedIn = await establishMagicLinkSession(srv, response, emailLower, stored.user_id);
	if (!signedIn.ok) {
		return jsonPasskeyError("verify_failed", 500);
	}

	const hostname = request.headers.get("host")?.split(":")[0] ?? "";
	if (needsOverseasSessionHandoff(hostname)) {
		try {
			const ticket = await signSessionHandoff({
				accessToken: signedIn.accessToken,
				refreshToken: signedIn.refreshToken,
				nextPath: redirectTo,
			});
			return NextResponse.json({
				success: true,
				redirectTo: buildCanonicalHandoffUrl(ticket, redirectTo),
			});
		} catch (error) {
			console.error("[passkey login/verify] handoff failed", error);
			return jsonPasskeyError("verify_failed", 500);
		}
	}

	return response;
}
