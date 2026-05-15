import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function CjkztMailConfigGuidePage() {
	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="bg-primary/15 text-primary flex size-11 items-center justify-center rounded-xl">
						<MailCheck className="size-6" aria-hidden />
					</div>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">邮件配置指南</h1>
						<p className="text-muted-foreground mt-1 text-sm">仅供管理员参考，不会强制修改 DNS。</p>
					</div>
				</div>
				<Link href={`${ADMIN_BASE_PATH}/fees`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
					返回 {t("navFees")}
				</Link>
			</header>

			<Card className="border-border/80 bg-card/35">
				<CardHeader>
					<CardTitle>为什么会被拦截</CardTitle>
					<CardDescription>发件域名若未配置 SPF / DKIM，邮件容易被判定为垃圾邮件。</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-sm text-muted-foreground">
					<p>建议在域名 DNS 中添加 SPF 与 DKIM 记录，确保收件方能验证来源真实性。</p>
					<p>当前系统会在发送失败时提醒用户检查垃圾箱并将 noreply@tradelovin.com 加入白名单。</p>
				</CardContent>
			</Card>

			<Card className="border-border/80 bg-card/35">
				<CardHeader>
					<CardTitle>DNS 设置步骤（参考）</CardTitle>
					<CardDescription>以 Resend 控制台提示为准，不同 DNS 服务商界面略有差异。</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>1. 登录域名服务商后台，进入目标域名的 DNS 管理。</p>
					<p>2. 添加 SPF TXT 记录（通常为根域 @）。</p>
					<p>3. 添加 DKIM TXT 或 CNAME 记录（按 Resend 提供的 selector 配置）。</p>
					<p>4. 如有需要，补充 DMARC 记录提升可投递性。</p>
					<p>5. 回到 Resend 控制台校验记录状态，等待 DNS 生效后重试发信。</p>
				</CardContent>
			</Card>
		</main>
	);
}
