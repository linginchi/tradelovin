import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
	countRecentMagicLinkSends,
	generateMagicLinkToken,
	issueMagicLinkToken,
	MAGIC_LINK_SEND_LIMIT_PER_HOUR,
} from "@/lib/auth/magic-link";
import { resolveResendEnv } from "@/lib/email/resend-config";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email(),
	next: z.string().trim().optional(),
});

function getMagicLinkBaseUrl(request: Request): string {
	const preferred =
		process.env.MAGIC_LINK_ORIGIN?.trim() ||
		process.env.APP_ORIGIN?.trim() ||
		"https://xeoaxis.com";
	if (/^https?:\/\//i.test(preferred)) return preferred.replace(/\/+$/, "");
	const reqUrl = new URL(request.url);
	return `${reqUrl.protocol}//${preferred}`.replace(/\/+$/, "");
}

export async function POST(request: Request) {
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "请提供有效邮箱" }, { status: 400 });
	}

	const email = parsed.data.email.trim().toLowerCase();
	const nextPath =
		parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//")
			? parsed.data.next
			: null;
	const sentInLastHour = await countRecentMagicLinkSends(srv, email);
	if (sentInLastHour >= MAGIC_LINK_SEND_LIMIT_PER_HOUR) {
		return NextResponse.json(
			{ success: false, error: "发送过于频繁，请 1 小时后再试", code: "RATE_LIMITED" },
			{ status: 429 },
		);
	}

	const token = generateMagicLinkToken();
	const ok = await issueMagicLinkToken(srv, email, token);
	if (!ok) {
		return NextResponse.json({ success: false, error: "无法创建登录链接，请稍后重试" }, { status: 500 });
	}

	const resendCfg = resolveResendEnv();
	if (!resendCfg.ok) {
		return NextResponse.json(
			{
				success: false,
				code: "EMAIL_PROVIDER_MISCONFIGURED",
				error: "邮件服务暂不可用，请稍后重试",
				errorEn: "Email service is temporarily unavailable. Please try again later.",
			},
			{ status: 503 },
		);
	}

	const baseUrl = getMagicLinkBaseUrl(request);
	const loginUrl = `${baseUrl}/auth/magic-link?token=${encodeURIComponent(token)}${
		nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""
	}`;
	const resend = new Resend(resendCfg.apiKey);

	const { error: sendErr } = await resend.emails.send({
		from: resendCfg.from,
		to: email,
		subject: "您的豹仔乐园登录链接",
		text: [
			"点击以下链接登录（15分钟内有效）：",
			"",
			loginUrl,
			"",
			"如果无法点击，请复制链接到浏览器打开。",
			"",
			"安全提示：豹仔乐园永远不会要求您输入密码。请确认发件人为 noreply@tradelovin.com。",
		].join("\n"),
		html: `
			<p>点击以下链接登录（15分钟内有效）：</p>
			<p><a href="${loginUrl}">${loginUrl}</a></p>
			<p>如果无法点击，请复制链接到浏览器打开。</p>
			<p><strong>安全提示：</strong>豹仔乐园永远不会要求您输入密码。请确认发件人为 noreply@tradelovin.com。</p>
		`,
	});

	if (sendErr) {
		console.error("[send-login-link email]", sendErr);
		return NextResponse.json({ success: false, error: "邮件发送失败" }, { status: 502 });
	}

	return NextResponse.json({
		success: true,
		message: "登录链接已发送，请查收邮件",
	});
}
