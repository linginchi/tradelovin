import { NextResponse } from "next/server";
import { z } from "zod";

import { promoteBootstrapSuperAdmin } from "@/lib/auth/bootstrap-super-admin";
import { signAdminToken } from "@/lib/auth/admin-jwt";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { verifyOtp } from "@/lib/auth/admin-otp";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "edge";

const bodySchema = z.object({
	email: z.string().email(),
	code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

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

	await promoteBootstrapSuperAdmin(supabase, email);

	const { data: adminFresh, error: refreshErr } = await supabase
		.from("admins")
		.select("email, role")
		.eq("email", email)
		.maybeSingle();

	if (refreshErr || !adminFresh) {
		return NextResponse.json({ error: "Invalid code or email" }, { status: 401 });
	}

	const token = await signAdminToken({
		email: adminFresh.email,
		role: adminFresh.role as "super_admin" | "admin",
	});

	const res = NextResponse.json({
		ok: true,
		role: adminFresh.role,
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
