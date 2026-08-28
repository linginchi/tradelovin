"use client";

import { useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Created = {
	payUrl: string;
	qrDataUrl: string;
	amountCents: number;
	payerName: string;
	note: string;
};

function formatHkd(cents: number): string {
	return `HK$ ${(cents / 100).toFixed(2)}`;
}

export function StaffPayClient({
	unlocked: unlockedInitially,
	stripeReady,
}: {
	unlocked: boolean;
	stripeReady: boolean;
}) {
	const [unlocked, setUnlocked] = useState(unlockedInitially);
	const [password, setPassword] = useState("");
	const [amountHkd, setAmountHkd] = useState("");
	const [payerName, setPayerName] = useState("");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [created, setCreated] = useState<Created | null>(null);
	const [copied, setCopied] = useState(false);

	async function onUnlock(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/staff/pay/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ password }),
			});
			const data = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !data.success) {
				setError(data.error ?? "密码错误");
				return;
			}
			setPassword("");
			setUnlocked(true);
		} catch {
			setError("网络错误，请稍后重试");
		} finally {
			setBusy(false);
		}
	}

	async function onLock() {
		setBusy(true);
		setError(null);
		try {
			await fetch("/api/staff/pay/logout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
			});
		} catch {
			/* still lock the form locally */
		} finally {
			setUnlocked(false);
			setCreated(null);
			setBusy(false);
		}
	}

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		setCopied(false);
		try {
			const res = await fetch("/api/staff/pay", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ amountHkd, payerName, note }),
			});
			const data = (await res.json()) as {
				success?: boolean;
				error?: string;
				payUrl?: string;
				amountCents?: number;
				payerName?: string;
				note?: string;
			};
			if (!res.ok || !data.success || !data.payUrl || data.amountCents == null) {
				setError(data.error ?? "生成失败，请重试");
				return;
			}
			const qrDataUrl = await QRCode.toDataURL(data.payUrl, {
				width: 512,
				margin: 2,
				errorCorrectionLevel: "M",
			});
			setCreated({
				payUrl: data.payUrl,
				qrDataUrl,
				amountCents: data.amountCents,
				payerName: data.payerName ?? payerName,
				note: data.note ?? note,
			});
		} catch {
			setError("网络错误，请稍后重试");
		} finally {
			setBusy(false);
		}
	}

	async function copyLink() {
		if (!created) return;
		try {
			await navigator.clipboard.writeText(created.payUrl);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	}

	return (
		<Card className="border-border/60 bg-card/40">
			<CardHeader>
				<CardTitle className="text-xl">学费收款</CardTitle>
				<CardDescription>
					{unlocked
						? "生成二维码，或复制链接发到微信直接点开付款页。"
						: "输入职员密码后即可生成收款码。"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{!unlocked ? (
					<form className="space-y-4" onSubmit={(event) => void onUnlock(event)}>
						<div className="space-y-2">
							<Label htmlFor="staff-password">职员密码</Label>
							<Input
								id="staff-password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>
						{error ? <p className="text-destructive text-sm">{error}</p> : null}
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "验证中…" : "进入"}
						</Button>
					</form>
				) : !stripeReady ? (
					<p className="text-destructive text-sm">
						本机未配置 STRIPE_SECRET_KEY（与会员升级同一项）。写入 .env.local 后重启 next
						dev，才能拉起真实收银台。
					</p>
				) : null}
				{unlocked && created ? (
					<div className="space-y-4">
						<p className="text-center text-base font-medium">
							{created.payerName} · {formatHkd(created.amountCents)}
						</p>
						{created.note ? (
							<p className="text-muted-foreground text-center text-sm">{created.note}</p>
						) : null}
						<img
							src={created.qrDataUrl}
							alt="学费支付二维码"
							width={320}
							height={320}
							className="mx-auto h-auto w-full max-w-[320px] rounded-lg bg-white p-3"
						/>
						<a
							href={created.payUrl}
							target="_blank"
							rel="noreferrer"
							className="text-primary block break-all text-center text-sm underline-offset-4 hover:underline"
						>
							{created.payUrl}
						</a>
						<p className="text-muted-foreground text-center text-xs">
							把上面的链接发到微信即可点开；也可以长按保存二维码转发。
						</p>
						<div className="flex flex-col gap-2">
							<Button type="button" onClick={() => void copyLink()}>
								{copied ? "已复制链接" : "复制微信链接"}
							</Button>
							<a
								href={created.payUrl}
								target="_blank"
								rel="noreferrer"
								className={cn(buttonVariants({ variant: "outline" }), "w-full")}
							>
								打开付款页
							</a>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setCreated(null);
									setCopied(false);
								}}
							>
								再生成一笔
							</Button>
						</div>
					</div>
				) : unlocked ? (
					<form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
						<div className="space-y-2">
							<Label htmlFor="amount">金额（港币）</Label>
							<Input
								id="amount"
								inputMode="decimal"
								placeholder="例如 8800"
								value={amountHkd}
								onChange={(e) => setAmountHkd(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payer">学生姓名</Label>
							<Input
								id="payer"
								value={payerName}
								onChange={(e) => setPayerName(e.target.value)}
								maxLength={80}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="note">备注（可选）</Label>
							<Input
								id="note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								maxLength={200}
								placeholder="课程或期数"
							/>
						</div>
						{error ? <p className="text-destructive text-sm">{error}</p> : null}
						<Button type="submit" className="w-full" disabled={busy || !stripeReady}>
							{busy ? "生成中…" : "生成二维码和链接"}
						</Button>
						<p className="text-muted-foreground text-xs">
							发给微信前，请先用手机能打开的地址访问本页再生成。同一 Wi-Fi 可用{" "}
							<span className="break-all">
								{typeof window !== "undefined" ? window.location.origin : ""}
								/staff/pay
							</span>
							。
						</p>
						<Button
							type="button"
							variant="ghost"
							className="w-full"
							onClick={() => void onLock()}
							disabled={busy}
						>
							退出
						</Button>
					</form>
				) : null}
				{unlocked ? (
					<p className="text-muted-foreground text-center text-xs">
						<Link href="/cjkzt/fees" className="underline-offset-4 hover:underline">
							返回收费通知
						</Link>
						。付款成功后请仍在后台手工标记已付。
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
