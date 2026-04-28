/**
 * Resend 发信所需环境变量（与 Cloudflare Worker / Vercel 等注入名对齐）。
 *
 * 主名：`RESEND_API_KEY`、`RESEND_FROM_EMAIL`
 * 备用：`RESEND_KEY`、`FROM_EMAIL`、`RESEND_FROM`（避免控制台里用了别名却与代码不一致）
 */
export type ResendEnvMissing = "RESEND_API_KEY" | "RESEND_FROM_EMAIL";

export type ResendEnvResolved =
	| { ok: true; apiKey: string; from: string }
	| {
			ok: false;
			code: "MISSING_RESEND_ENV";
			missing: ResendEnvMissing[];
			error: string;
			errorEn: string;
	  };

export function resolveResendEnv(): ResendEnvResolved {
	const apiKey =
		(typeof process.env.RESEND_API_KEY === "string" && process.env.RESEND_API_KEY.trim()) ||
		(typeof process.env.RESEND_KEY === "string" && process.env.RESEND_KEY.trim()) ||
		"";

	const from =
		(typeof process.env.RESEND_FROM_EMAIL === "string" && process.env.RESEND_FROM_EMAIL.trim()) ||
		(typeof process.env.FROM_EMAIL === "string" && process.env.FROM_EMAIL.trim()) ||
		(typeof process.env.RESEND_FROM === "string" && process.env.RESEND_FROM.trim()) ||
		"";

	const missing: ResendEnvMissing[] = [];
	if (!apiKey) missing.push("RESEND_API_KEY");
	if (!from) missing.push("RESEND_FROM_EMAIL");

	if (missing.length > 0) {
		const cn: string[] = [];
		const en: string[] = [];
		if (!apiKey) {
			cn.push("缺少 Resend API 密钥：请设置环境变量 RESEND_API_KEY（或备用名 RESEND_KEY）");
			en.push("Missing Resend API key: set RESEND_API_KEY (or RESEND_KEY) in the deployment environment.");
		}
		if (!from) {
			cn.push(
				"缺少发件人地址：请设置 RESEND_FROM_EMAIL（或 FROM_EMAIL / RESEND_FROM），且发信域名须在 Resend 控制台验证",
			);
			en.push(
				"Missing sender address: set RESEND_FROM_EMAIL (or FROM_EMAIL / RESEND_FROM); verify the sending domain in Resend.",
			);
		}
		return {
			ok: false,
			code: "MISSING_RESEND_ENV",
			missing,
			error: `${cn.join("；")}。请联系管理员在 Cloudflare Worker（或当前托管环境）的 Variables 中配置后重新部署。`,
			errorEn: `${en.join(" ")} Ask an admin to set Worker / hosting environment variables and redeploy.`,
		};
	}

	return { ok: true, apiKey, from };
}
