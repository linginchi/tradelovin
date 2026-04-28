import { Resend } from "resend";

import { resolveResendEnv } from "@/lib/email/resend-config";

export async function sendAdminEmail(params: {
	to: string;
	subject: string;
	text: string;
	html?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const cfg = resolveResendEnv();
	if (!cfg.ok) {
		return { ok: false, message: cfg.errorEn };
	}
	const resend = new Resend(cfg.apiKey);
	const { error } = await resend.emails.send({
		from: cfg.from,
		to: params.to,
		subject: params.subject,
		text: params.text,
		...(params.html ? { html: params.html } : {}),
	});
	if (error) {
		return { ok: false, message: error.message };
	}
	return { ok: true };
}
