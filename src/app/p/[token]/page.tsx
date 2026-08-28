import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { expireStaffPayLinkIfNeeded, getStaffPayLinkByToken } from "@/lib/staff-pay/store";
import { isWeChatUserAgent } from "@/lib/staff-pay/wechat";
import { getServiceSupabase } from "@/lib/supabase/service";

export const metadata: Metadata = {
	title: "学费支付",
	robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
	params: Promise<{ token: string }>;
	searchParams: Promise<{ paid?: string; canceled?: string }>;
};

function Shell({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
	return (
		<main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
			<div className="rounded-xl bg-card px-5 py-8 text-center ring-1 ring-foreground/10">
				<h1 className="text-xl font-medium">{title}</h1>
				<p className="text-muted-foreground mt-3 text-sm leading-6">{body}</p>
				{action ? <div className="mt-6">{action}</div> : null}
			</div>
		</main>
	);
}

export default async function PublicPayPage({ params, searchParams }: Props) {
	const { token } = await params;
	const query = await searchParams;
	const ua = (await headers()).get("user-agent");

	if (query.paid === "1") {
		return (
			<Shell
				title="已收到付款"
				body="感谢缴费。职员会在后台确认到账并标记已付，无需重复支付。"
			/>
		);
	}

	if (query.canceled === "1") {
		return <Shell title="已取消" body="没有完成付款。请联系职员重新生成收款码。" />;
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return <Shell title="暂时无法支付" body="服务未就绪，请稍后重试或联系职员。" />;
	}

	const found = await getStaffPayLinkByToken(supabase, token);
	if (!found) {
		return <Shell title="链接无效" body="这条收款链接不存在。请联系职员重新发送。" />;
	}

	const link = await expireStaffPayLinkIfNeeded(supabase, found);
	if (link.status === "paid") {
		return <Shell title="已收到付款" body="这笔学费已经付过。如有疑问请联系职员。" />;
	}
	if (link.status === "expired") {
		return <Shell title="链接已过期" body="请联系职员重新生成收款二维码。" />;
	}

	const amount = `HK$ ${(link.amount_cents / 100).toFixed(2)}`;
	const summary = link.note ? `${link.payer_name} · ${amount} · ${link.note}` : `${link.payer_name} · ${amount}`;

	if (isWeChatUserAgent(ua)) {
		return (
			<Shell
				title="学费支付"
				body={`请确认后点击去支付：${summary}`}
				action={
					<a
						href={link.checkout_url}
						className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground"
					>
						去支付
					</a>
				}
			/>
		);
	}

	redirect(link.checkout_url);
}
