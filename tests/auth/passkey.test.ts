import assert from "node:assert/strict";
import test from "node:test";
import {
	classifyPasskeyLoginError,
	enrollDismissStorageKey,
	isChallengeOpen,
	isLocalDevAuthHost,
	isSignCountValid,
	passkeyOriginAllowed,
	registrationExcludeCredentials,
	resolvePasskeyRpId,
} from "@/lib/auth/passkey";
import { consumePasskeyChallenge, casUpdatePasskeySignCount } from "@/lib/auth/passkey-api";

test("resolvePasskeyRpId maps entry hosts and rejects legacy tradelovin", () => {
	assert.equal(resolvePasskeyRpId("leolearnstotrade.com"), "leolearnstotrade.com");
	assert.equal(resolvePasskeyRpId("www.leolearnstotrade.com"), "leolearnstotrade.com");
	assert.equal(resolvePasskeyRpId("xeoaxis.com"), "xeoaxis.com");
	assert.equal(resolvePasskeyRpId("www.xeoaxis.com"), "xeoaxis.com");
	assert.equal(resolvePasskeyRpId("localhost:3001"), "localhost");
	assert.equal(resolvePasskeyRpId("127.0.0.1"), "localhost");
	assert.equal(resolvePasskeyRpId("tradelovin.com"), null);
	assert.equal(resolvePasskeyRpId("www.tradelovin.com"), null);
});

test("passkeyOriginAllowed matches https rp and http localhost", () => {
	assert.equal(passkeyOriginAllowed("https://leolearnstotrade.com", "leolearnstotrade.com"), true);
	assert.equal(passkeyOriginAllowed("https://www.leolearnstotrade.com", "leolearnstotrade.com"), true);
	assert.equal(passkeyOriginAllowed("https://xeoaxis.com", "leolearnstotrade.com"), false);
	assert.equal(passkeyOriginAllowed("http://localhost:3001", "localhost"), true);
});

test("challenge is one-shot and 5-minute window", () => {
	const now = Date.parse("2026-08-26T13:00:00.000Z");
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T13:04:59.000Z", consumed_at: null }, now),
		true,
	);
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T12:59:59.000Z", consumed_at: null }, now),
		false,
	);
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T13:04:59.000Z", consumed_at: "2026-08-26T12:58:00.000Z" }, now),
		false,
	);
});

test("signCount rejects rollback except both-zero authenticators", () => {
	assert.equal(isSignCountValid(0, 0), true);
	assert.equal(isSignCountValid(3, 4), true);
	assert.equal(isSignCountValid(4, 4), false);
	assert.equal(isSignCountValid(5, 4), false);
	assert.equal(isSignCountValid(2, 0), false);
});

test("enroll dismiss key is per user and rpId", () => {
	assert.equal(
		enrollDismissStorageKey("user-1", "xeoaxis.com"),
		"passkey_enroll_dismissed:user-1:xeoaxis.com",
	);
});

test("replace rebind does not exclude the existing platform credential", () => {
	assert.deepEqual(registrationExcludeCredentials({ credential_id: "old-cred" }, true), []);
	assert.deepEqual(registrationExcludeCredentials({ credential_id: "old-cred" }, false), []);
	assert.deepEqual(registrationExcludeCredentials(null, false), []);
});

function mockCasUpdateClient(result: { data: { id: string } | null; error: { message: string } | null }) {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain: {
		update: (...args: unknown[]) => unknown;
		eq: (...args: unknown[]) => unknown;
		is: (...args: unknown[]) => unknown;
		select: (...args: unknown[]) => unknown;
		maybeSingle: () => Promise<unknown>;
	} = {
		update: (...args: unknown[]) => {
			calls.push({ method: "update", args });
			return chain;
		},
		eq: (...args: unknown[]) => {
			calls.push({ method: "eq", args });
			return chain;
		},
		is: (...args: unknown[]) => {
			calls.push({ method: "is", args });
			return chain;
		},
		select: (...args: unknown[]) => {
			calls.push({ method: "select", args });
			return chain;
		},
		maybeSingle: async () => result,
	};
	return {
		calls,
		client: {
			from(table: string) {
				calls.push({ method: "from", args: [table] });
				return chain;
			},
		},
	};
}

test("consumePasskeyChallenge CAS claims an open row and rejects a second consume", async () => {
	const won = mockCasUpdateClient({ data: { id: "chal-1" }, error: null });
	assert.equal(await consumePasskeyChallenge(won.client as never, "chal-1"), true);
	assert.ok(won.calls.some((c) => c.method === "is" && c.args[0] === "consumed_at" && c.args[1] === null));
	assert.ok(won.calls.some((c) => c.method === "select" && c.args[0] === "id"));

	const lost = mockCasUpdateClient({ data: null, error: null });
	assert.equal(await consumePasskeyChallenge(lost.client as never, "chal-1"), false);
});

test("casUpdatePasskeySignCount requires the stored counter in the WHERE clause", async () => {
	const won = mockCasUpdateClient({ data: { id: "cred-1" }, error: null });
	assert.equal(await casUpdatePasskeySignCount(won.client as never, "cred-1", 3, 4), true);
	assert.ok(won.calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "cred-1"));
	assert.ok(won.calls.some((c) => c.method === "eq" && c.args[0] === "sign_count" && c.args[1] === 3));

	const lost = mockCasUpdateClient({ data: null, error: null });
	assert.equal(await casUpdatePasskeySignCount(lost.client as never, "cred-1", 0, 0), false);
});

test("isLocalDevAuthHost only matches loopback hosts", () => {
	assert.equal(isLocalDevAuthHost("localhost"), true);
	assert.equal(isLocalDevAuthHost("localhost:3001"), true);
	assert.equal(isLocalDevAuthHost("127.0.0.1"), true);
	assert.equal(isLocalDevAuthHost("leolearnstotrade.com"), false);
	assert.equal(isLocalDevAuthHost("192.168.1.12"), false);
});

test("classifyPasskeyLoginError maps not_enrolled and NotAllowedError to needs_enroll", () => {
	assert.equal(classifyPasskeyLoginError(new Error("not_enrolled")), "needs_enroll");
	assert.equal(classifyPasskeyLoginError({ code: "not_enrolled" }), "needs_enroll");
	const denied = new Error("The operation either timed out or was not allowed.");
	denied.name = "NotAllowedError";
	assert.equal(classifyPasskeyLoginError(denied), "needs_enroll");
	const aborted = new Error("aborted");
	aborted.name = "AbortError";
	assert.equal(classifyPasskeyLoginError(aborted), "cancelled");
	assert.equal(classifyPasskeyLoginError(new Error("passkey_failed")), "failed");
	assert.equal(classifyPasskeyLoginError({ code: "verify_failed" }), "failed");
	assert.equal(
		classifyPasskeyLoginError(new Error("服务端未配置 SUPABASE_SERVICE_ROLE_KEY")),
		"missing_service_role",
	);
	assert.equal(classifyPasskeyLoginError({ code: "service_unavailable" }), "missing_service_role");
	assert.equal(classifyPasskeyLoginError(new Error("service_unavailable")), "missing_service_role");
});
