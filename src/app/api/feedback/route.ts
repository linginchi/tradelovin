import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { resolveResendEnv } from "@/lib/email/resend-config";

export const runtime = "nodejs";

const bodySchema = z.object({
	context: z.string().trim().optional(),
	description: z.string().trim().min(1, "问题描述不能为空"),
	contactEmail: z.string().trim().email().optional(),
	screenshotName: z.string().trim().optional(),
	screenshotDataUrl: z.string().trim().optional(),
});

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
	const receiver = resolveFeedbackReceiver();
	const resend = new Resend(resendCfg.apiKey);

	const text = [
		"收到新的用户反馈：",
		`场景: ${data.context ?? "未提供"}`,
		`联系方式: ${data.contactEmail ?? "未提供"}`,
		`截图文件名: ${data.screenshotName ?? "未提供"}`,
		"",
		"问题描述：",
		data.description,
		"",
		data.screenshotDataUrl ? `截图数据(前200字符): ${data.screenshotDataUrl.slice(0, 200)}...` : "截图数据: 无",
	].join("\n");

	const html = `
		<h3>收到新的用户反馈</h3>
		<p><strong>场景：</strong>${data.context ?? "未提供"}</p>
		<p><strong>联系方式：</strong>${data.contactEmail ?? "未提供"}</p>
		<p><strong>截图文件名：</strong>${data.screenshotName ?? "未提供"}</p>
		<p><strong>问题描述：</strong></p>
		<pre>${data.description.replace(/[<>]/g, "")}</pre>
	`;

	const { error } = await resend.emails.send({
		from: resendCfg.from,
		to: receiver,
		subject: "[TradeLovin] 新的问题反馈",
		text,
		html,
	});

	if (error) {
		console.error("[feedback send]", error);
		return NextResponse.json({ success: false, error: "反馈发送失败，请稍后重试" }, { status: 502 });
	}

	return NextResponse.json({ success: true });
}
