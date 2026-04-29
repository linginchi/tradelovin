import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminPortalEmail } from "@/lib/auth/admin-gate";
import {
	ensureBootstrapSuperAdminRow,
	isBootstrapSuperAdminEmail,
	isFixedBootstrapOtpEnabled,
	isSuperAdminRole,
	promoteBootstrapSuperAdmin,
} from "@/lib/auth/bootstrap-super-admin";
import { signAdminToken } from "@/lib/auth/admin-jwt";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { verifyOtp } from "@/lib/auth/admin-otp";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";
import { BOOTSTRAP_SUPER_ADMIN_FIXED_OTP } from "@/lib/auth/admin-portal-constants";

const bodySchema = z.object({
	email: z.string().email(),
	code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid input" }, { status: 400 });
	}

	const email = parsed.data.email.trim().toLowerCase();
	const code = parsed.data.code;
	const fixedOtpEnabled = isFixedBootstrapOtpEnabled();
	const ip = clientIpFromHeaders(req.headers);

	const perIp = checkRateLimit({
		bucket: "admin-verify-code-ip",
		key: ip,
		windowMs: 10 * 60 * 1000,
		maxHits: 20,
	});
	if (perIp.limited) {
		return NextResponse.json(
			{ error: "Too many requests", errorZh: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perIp.retryAfterSec) } },
		);
	}

	const perEmail = checkRateLimit({
		bucket: "admin-verify-code-email",
		key: email,
		windowMs: 10 * 60 * 1000,
		maxHits: 8,
	});
	if (perEmail.limited) {
		return NextResponse.json(
			{ error: "Too many requests", errorZh: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perEmail.retryAfterSec) } },
		);
	}

	if (!isAdminPortalEmail(email)) {
		return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
	}

	const useFixedBootstrapOtp =
		fixedOtpEnabled && isBootstrapSuperAdminEmail(email) && code === BOOTSTRAP_SUPER_ADMIN_FIXED_OTP;

	const supabase = getServiceSupabase();
	if (!supabase) {
		if (useFixedBootstrapOtp) {
			const token = await signAdminToken({
				email,
				role: "super_admin",
			});

			const res = NextResponse.json({
				ok: true,
				role: "super_admin",
			});
			res.cookies.set(ADMIN_TOKEN_COOKIE, token, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				path: "/",
				maxAge: 60 * 60 * 24 * 7,
			});
			return res;
		}
		return NextResponse.json(
			{
				error: "Server misconfigured",
				errorZh: "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请在 .env.local 配置后重启 dev。",
			},
			{ status: 503 },
		);
	}

	if (useFixedBootstrapOtp) {
		const { error: ensureErr } = await ensureBootstrapSuperAdminRow(supabase);
		if (ensureErr) {
			console.error("[admin verify-code] ensureBootstrapSuperAdminRow", ensureErr);
			return NextResponse.json({ error: "Server error" }, { status: 500 });
		}
		console.warn(
			`[FIXED OTP] /cjkzt login for ${email} with explicit env toggle`,
		);
		await supabase.from("admin_otp_challenges").delete().eq("email", email);
	} else {
		const { data: admin, error: adminErr } = await supabase
			.from("admins")
			.select("email, role")
			.eq("email", email)
			.maybeSingle();

		if (adminErr || !admin) {
			return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
		}

		const { data: row } = await supabase
			.from("admin_otp_challenges")
			.select("id, code_hash, expires_at")
			.eq("email", email)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (!row) {
			return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
		}

		if (new Date(row.expires_at) < new Date()) {
			return NextResponse.json({ error: "Code expired" }, { status: 401 });
		}

		if (!(await verifyOtp(email, code, row.code_hash))) {
			return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
		}

		await supabase.from("admin_otp_challenges").delete().eq("email", email);
	}

	await promoteBootstrapSuperAdmin(supabase, email);

	const { data: adminFresh, error: refreshErr } = await supabase
		.from("admins")
		.select("email, role")
		.eq("email", email)
		.maybeSingle();

	if (refreshErr || !adminFresh) {
		return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
	}

	if (!isSuperAdminRole(adminFresh.role)) {
		return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
	}

	const token = await signAdminToken({
		email: adminFresh.email,
		role: "super_admin",
	});

	const res = NextResponse.json({
		ok: true,
		role: "super_admin",
	});
	res.cookies.set(ADMIN_TOKEN_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
	});
	return res;
}
