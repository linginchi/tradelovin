import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseRouteClient } from "@/lib/auth/auto-register";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email(),
	password: z.string().min(1),
});

export async function POST(request: NextRequest) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json(
			{ success: false, error: "请求体格式错误", errorEn: "Invalid request body" },
			{ status: 400 },
		);
	}

	const parsed = bodySchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json(
			{ success: false, error: "请提供有效邮箱和密码", errorEn: "Valid email and password required" },
			{ status: 400 },
		);
	}

	const email = parsed.data.email.trim().toLowerCase();
	const password = parsed.data.password;

	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		return NextResponse.json(
			{
				success: false,
				error: "登录服务未配置，请稍后重试",
				errorEn: "Auth service is not configured",
			},
			{ status: 503 },
		);
	}

	const response = NextResponse.json({ success: true });
	const supabase = createSupabaseRouteClient(request, response);
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });

	if (error || !data.session) {
		console.warn("[password-login]", {
			email,
			message: error?.message ?? "no session",
			status: error?.status,
			code: error?.code,
			name: error?.name,
		});
		return NextResponse.json(
			{
				success: false,
				error: "邮箱或密码错误",
				errorEn: "Invalid email or password",
				detail: process.env.NODE_ENV !== "production" ? (error?.message ?? "no session") : undefined,
			},
			{ status: 401 },
		);
	}

	return response;
}
