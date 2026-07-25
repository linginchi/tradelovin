import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminEmailLinkLoginForm } from "@/components/admin/AdminEmailLinkLoginForm";
import { getAdminSession } from "@/lib/auth/admin-session";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function CjkztLoginPage() {
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (session) {
		if (session.role === "analytics") {
			redirect("/admin/analytics");
		}
		redirect("/cjkzt");
	}

	const isDev = process.env.NODE_ENV !== "production";

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
				{isDev ? (
					<div className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
						<p className="text-amber-300 text-sm font-medium mb-2">本地开发模式 — 跳过邮箱验证</p>
						<p className="text-muted-foreground text-xs">
							在浏览器打开以下链接即可直接登录（无需密码）：
						</p>
						<a
							href="/api/admin/dev-login?email=mark@hkfac.com"
							className="inline-block mt-2 text-cyan-300 underline text-sm font-mono"
						>
							/api/admin/dev-login?email=mark@hkfac.com
						</a>
					</div>
				) : null}
				<Suspense fallback={<p className="text-muted-foreground text-sm">…</p>}>
					<AdminEmailLinkLoginForm />
				</Suspense>
			</div>
		</div>
	);
}
