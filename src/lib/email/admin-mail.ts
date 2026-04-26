import { Resend } from "resend";

export async function sendAdminEmail(params: {
	to: string;
	subject: string;
	text: string;
	html?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const resendKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;
	if (!resendKey || !from) {
		return { ok: false, message: "Email not configured" };
	}
	const resend = new Resend(resendKey);
	const { error } = await resend.emails.send({
		from,
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
