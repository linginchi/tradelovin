import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { resolveResendEnv } from "@/lib/email/resend-config";
import {
	MAX_SCREENSHOT_DATA_URL_LENGTH,
	parseScreenshotDataUrl,
} from "@/lib/email/screenshot-attachment";

export const runtime = "nodejs";

const bodySchema = z.object({
	context: z.string().trim().optional(),
	description: z.string().trim().min(1, "问题描述不能为空"),
	contactEmail: z.string().trim().email().optional(),
	contact: z.string().trim().max(200).optional(),
	diagnostics: z.string().trim().max(12000).optional(),
	screenshotName: z.string().trim().optional(),
	screenshotDataUrl: z.string().trim().max(MAX_SCREENSHOT_DATA_URL_LENGTH).optional(),
});

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		if (char === "&") return "&amp;";
		if (char === "<") return "&lt;";
		if (char === ">") return "&gt;";
		if (char === '"') return "&quot;";
		return "&#39;";
	});
}

function resolveFeedbackReceiver(): string {
	return (
		process.env.FEEDBACK_RECEIVER_EMAIL?.trim() ||
		process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
		process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim() ||
		"mark@hkfac.com"
	);
}

export async function POST(request: Request) {
	const resendCfg = resolveResendEnv();
	if (!resendCfg.ok) {
		return NextResponse.json(
			{
				success: false,
				error: "邮件服务暂不可用，请稍后再试",
				detail: resendCfg.error,
			},
			{ status: 503 },
		);
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
	}

	const data = parsed.data;
	const parsedShot = parseScreenshotDataUrl(data.screenshotDataUrl, data.screenshotName);
	if (!parsedShot.ok) {
		return NextResponse.json({ success: false, error: parsedShot.error }, { status: 400 });
	}
	const attachment = parsedShot.attachment;
	const receiver = resolveFeedbackReceiver();
	const resend = new Resend(resendCfg.apiKey);

	const text = [
		"收到新的用户反馈：",
		`场景: ${data.context ?? "未提供"}`,
		`联系方式: ${data.contact ?? data.contactEmail ?? "未提供"}`,
		`截图文件名: ${attachment?.filename ?? data.screenshotName ?? "未提供"}`,
		`截图附件: ${attachment ? "已附上" : "无"}`,
		"",
		"用户描述：",
		data.description,
		"",
		"自动诊断：",
		data.diagnostics ?? "未提供",
	].join("\n");

	const screenshotHtml =
		attachment && data.screenshotDataUrl?.startsWith("data:image/")
			? `<p><strong>截图：</strong>${escapeHtml(attachment.filename)}（见附件，正文亦可预览）</p><p><img src="${data.screenshotDataUrl}" alt="${escapeHtml(attachment.filename)}" style="max-width:100%;height:auto;border:1px solid #ddd" /></p>`
			: "";

	const html = `
		<h3>收到新的用户反馈</h3>
		<p><strong>场景：</strong>${escapeHtml(data.context ?? "未提供")}</p>
		<p><strong>联系方式：</strong>${escapeHtml(data.contact ?? data.contactEmail ?? "未提供")}</p>
		<p><strong>用户描述：</strong></p>
		<pre>${escapeHtml(data.description)}</pre>
		<p><strong>自动诊断：</strong></p>
		<pre>${escapeHtml(data.diagnostics ?? "未提供")}</pre>
		${screenshotHtml}
	`;

	const { error } = await resend.emails.send({
		from: resendCfg.from,
		to: receiver,
		subject: "[TradeLovin] 测试反馈 / 问题反馈",
		text,
		html,
		attachments: attachment
			? [
					{
						filename: attachment.filename,
						content: attachment.content,
						contentType: attachment.contentType,
					},
				]
			: undefined,
	});

	if (error) {
		console.error("[feedback send]", error);
		return NextResponse.json({ success: false, error: "反馈发送失败，请稍后重试" }, { status: 502 });
	}

	return NextResponse.json({ success: true });
}
