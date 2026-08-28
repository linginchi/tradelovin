import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminEmailLinkLoginForm } from "@/components/admin/AdminEmailLinkLoginForm";
import { AdminPasswordLoginForm } from "@/components/admin/AdminPasswordLoginForm";
import { getAdminSession } from "@/lib/auth/admin-session";
import { routing } from "@/i18n/routing";
import { resolveAdminLoginNextPath } from "@/lib/staff-pay/staff-pay";

const locale = routing.defaultLocale;

type Props = { searchParams: Promise<{ next?: string }> };

export default async function CjkztLoginPage({ searchParams }: Props) {
	setRequestLocale(locale);

	const nextPath = resolveAdminLoginNextPath((await searchParams).next);
	const session = await getAdminSession();
	if (session) {
		redirect(nextPath);
	}

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
				<Suspense fallback={<p className="text-muted-foreground text-sm">…</p>}>
					<AdminEmailLinkLoginForm />
				</Suspense>
				<AdminPasswordLoginForm
					title="密码登录"
					description="本机未配置发信服务时，请用管理员邮箱和密码登录。"
					redirectTo={nextPath}
					idPrefix="cjkzt-password"
				/>
			</div>
		</div>
	);
}
