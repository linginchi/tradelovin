#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? "").trim().replace(/\/+$/, "");
const email = (process.env.MAGIC_LINK_EMAIL ?? "").trim().toLowerCase();
const token = (process.env.MAGIC_LINK_TOKEN ?? "").trim();
const nextPathRaw = (process.env.MAGIC_LINK_NEXT ?? "/my-learning").trim();

if (!baseUrl) {
	console.error("Missing BASE_URL. Example: BASE_URL=https://leolearnstotrade.com node scripts/deploy/auth-magic-link-smoke.mjs");
	process.exit(1);
}

if (!email) {
	console.error("Missing MAGIC_LINK_EMAIL. Example: MAGIC_LINK_EMAIL=test@example.com");
	process.exit(1);
}

if (!token) {
	console.error("Missing MAGIC_LINK_TOKEN. Example: MAGIC_LINK_TOKEN=<copied-from-db>");
	process.exit(1);
}

const nextPath =
	nextPathRaw.startsWith("/") && !nextPathRaw.startsWith("//") ? nextPathRaw : "/my-learning";

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(`ASSERT_FAIL: ${message}`);
	}
	console.log(`ASSERT PASS ${message}`);
}

async function sendLoginLink() {
	const res = await fetch(`${baseUrl}/api/auth/send-login-link`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
		redirect: "manual",
	});
	const text = await res.text();
	let json = null;
	try {
		json = JSON.parse(text);
	} catch {
		// ignore
	}
	const ok = res.ok && json?.success === true;
	console.log(`${ok ? "PASS" : "FAIL"} send-login-link -> ${res.status}`);
	assertTrue(ok, `send-login-link success (detail=${String(json?.error ?? text).slice(0, 160)})`);
}

function extractCookieHeader(headers) {
	const values = [];
	if (typeof headers.getSetCookie === "function") {
		values.push(...headers.getSetCookie());
	}
	const single = headers.get("set-cookie");
	if (single) values.push(single);
	return values.join("; ");
}

async function consumeMagicLink() {
	const url = `${baseUrl}/api/auth/magic-link?token=${encodeURIComponent(token)}&next=${encodeURIComponent(nextPath)}`;
	const res = await fetch(url, {
		method: "GET",
		redirect: "manual",
	});
	const location = res.headers.get("location") ?? "";
	const cookieHeader = extractCookieHeader(res.headers);
	const isRedirect = res.status >= 300 && res.status < 400;
	console.log(`${isRedirect ? "PASS" : "FAIL"} consume-magic-link -> ${res.status} ${location}`);
	assertTrue(isRedirect, "consume endpoint returns redirect");
	assertTrue(location.endsWith(nextPath), "consume redirect goes to requested next path");
	assertTrue(cookieHeader.toLowerCase().includes("sb-"), "consume response sets supabase session cookie");
	return { cookieHeader };
}

async function consumeSameTokenAgain() {
	const url = `${baseUrl}/api/auth/magic-link?token=${encodeURIComponent(token)}&next=${encodeURIComponent(nextPath)}`;
	const res = await fetch(url, {
		method: "GET",
		redirect: "manual",
	});
	const location = res.headers.get("location") ?? "";
	const isRedirect = res.status >= 300 && res.status < 400;
	console.log(`${isRedirect ? "PASS" : "FAIL"} consume-magic-link-again -> ${res.status} ${location}`);
	assertTrue(isRedirect, "consume again returns redirect");
	assertTrue(location.includes("/login?error=invalid_link"), "token can only be used once");
}

async function verifySession(cookieHeader) {
	const res = await fetch(`${baseUrl}/api/auth/me`, {
		method: "GET",
		headers: {
			Cookie: cookieHeader,
		},
	});
	const text = await res.text();
	let json = null;
	try {
		json = JSON.parse(text);
	} catch {
		// ignore
	}
	const ok = res.ok && json?.success === true;
	console.log(`${ok ? "PASS" : "FAIL"} auth-me -> ${res.status}`);
	assertTrue(ok, "auth/me returns success");
	assertTrue(Boolean(json?.loggedIn), "auth/me shows logged in");
	assertTrue(typeof json?.userId === "string" && json.userId.length > 0, "auth/me returns userId");
}

async function main() {
	await sendLoginLink();
	const { cookieHeader } = await consumeMagicLink();
	await verifySession(cookieHeader);
	await consumeSameTokenAgain();
	console.log("Magic-link smoke checks completed.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
