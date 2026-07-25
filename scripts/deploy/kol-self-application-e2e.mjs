#!/usr/bin/env node
/**
 * KOL 自荐流程 API E2E：
 * apply-self → 注入已知 OTP → verify-otp → 校验 DB 状态
 *
 * 用法：
 *   node scripts/deploy/kol-self-application-e2e.mjs
 *   BASE_URL=http://localhost:3000 node scripts/deploy/kol-self-application-e2e.mjs
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(import.meta.dirname, "../..");
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
const testOtp = "654321";

function loadEnvFile(name) {
	const path = resolve(root, name);
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		if (process.env[key] === undefined) process.env[key] = val;
	}
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function hashOtp(email, code) {
	const pepper =
		process.env.ADMIN_OTP_PEPPER?.trim() ||
		process.env.ADMIN_JWT_SECRET?.trim() ||
		"";
	if (!pepper) throw new Error("Missing ADMIN_OTP_PEPPER or ADMIN_JWT_SECRET in .env.local");
	const normalized = email.trim().toLowerCase();
	return createHmac("sha256", pepper).update(`${normalized}:${code}`).digest("hex");
}

function fail(msg) {
	console.error(`FAIL ${msg}`);
	process.exit(1);
}

function pass(msg) {
	console.log(`PASS ${msg}`);
}

async function main() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!supabaseUrl || !serviceKey) {
		fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
	}

	const email = `kol-e2e-${Date.now()}@test.tradelovin.local`;
	const srv = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	console.log(`\n=== KOL self-application E2E ===`);
	console.log(`BASE_URL=${baseUrl}`);
	console.log(`TEST_EMAIL=${email}\n`);

	// Step 1: apply-self
	const applyBody = {
		email,
		channelName: "E2E Test Channel",
		platformAccounts: [{ platform: "xiaohongshu", account: "e2e_test_account" }],
	};
	const applyRes = await fetch(`${baseUrl}/api/channel-partner/apply-self`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(applyBody),
	});
	const applyJson = await applyRes.json().catch(() => ({}));

	if (applyRes.status === 401 && applyJson.error === "未登录") {
		fail(
			`apply-self returned 401 未登录 — 生产环境可能尚未部署匿名自荐 API，请部署后再测或使用 BASE_URL=http://localhost:3000`,
		);
	}

	if (!applyRes.ok && applyRes.status !== 503) {
		fail(`apply-self -> ${applyRes.status} ${JSON.stringify(applyJson)}`);
	}

	if (applyRes.status === 503) {
		console.log(
			`WARN apply-self mail send failed (503) — continuing if DB rows were created: ${applyJson.error ?? ""}`,
		);
	} else if (applyRes.status === 201 && applyJson.success) {
		pass(`apply-self -> 201 applicationId=${applyJson.data?.applicationId ?? "?"}`);
	} else {
		fail(`apply-self unexpected response: ${applyRes.status} ${JSON.stringify(applyJson)}`);
	}

	// Step 2: confirm application row
	const { data: appRow, error: appErr } = await srv
		.from("kol_applications")
		.select("id,status,email_verified")
		.eq("email", email)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (appErr || !appRow?.id) {
		fail(`kol_applications row missing: ${appErr?.message ?? "not found"}`);
	}
	if (appRow.status !== "pending_verification") {
		fail(`expected pending_verification, got ${appRow.status}`);
	}
	pass(`DB application row id=${appRow.id} status=${appRow.status}`);

	// Step 3: inject known OTP hash (avoids reading real email)
	const codeHash = hashOtp(email, testOtp);
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
	await srv.from("email_verification_codes").delete().eq("email", email).eq("intent", "kol_application");
	const { error: otpInsertErr } = await srv.from("email_verification_codes").insert({
		email,
		code_hash: codeHash,
		intent: "kol_application",
		expires_at: expiresAt,
	});
	if (otpInsertErr) fail(`OTP inject failed: ${otpInsertErr.message}`);
	pass(`injected test OTP hash for ${email}`);

	// Step 4: verify-otp
	const verifyRes = await fetch(`${baseUrl}/api/channel-partner/apply-self/verify-otp`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, code: testOtp }),
	});
	const verifyJson = await verifyRes.json().catch(() => ({}));
	if (!verifyRes.ok || !verifyJson.success) {
		fail(`verify-otp -> ${verifyRes.status} ${JSON.stringify(verifyJson)}`);
	}
	pass(`verify-otp -> 200 applicationId=${verifyJson.data?.applicationId ?? appRow.id}`);

	// Step 5: DB final state
	const { data: finalRow, error: finalErr } = await srv
		.from("kol_applications")
		.select("id,status,email_verified,email_verified_at")
		.eq("id", appRow.id)
		.single();

	if (finalErr || !finalRow) fail(`final DB read failed: ${finalErr?.message ?? "missing"}`);
	if (finalRow.status !== "pending_review" || !finalRow.email_verified) {
		fail(`expected pending_review + verified, got ${JSON.stringify(finalRow)}`);
	}
	pass(`DB final status=pending_review email_verified=true`);

	// Step 6: admin list API (expect 401 without cookie — route exists)
	const adminListRes = await fetch(
		`${baseUrl}/api/admin/kol-applications?status=pending_review`,
	);
	if (adminListRes.status === 401) {
		pass("admin kol-applications list -> 401 without session (route protected as expected)");
	} else if (adminListRes.ok) {
		const adminJson = await adminListRes.json();
		const found = (adminJson.data?.rows ?? []).some((r) => r.id === appRow.id);
		if (found) pass("admin kol-applications list includes test application");
		else fail("admin list OK but test application not found");
	} else {
		fail(`admin kol-applications unexpected status ${adminListRes.status}`);
	}

	// Cleanup test data
	await srv.from("email_verification_codes").delete().eq("email", email);
	await srv.from("kol_applications").delete().eq("id", appRow.id);
	pass(`cleaned up test application ${appRow.id}`);

	console.log("\n=== KOL self-application E2E: ALL PASSED ===\n");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
