import Link from "next/link";
import { ArrowLeft, Mail, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AboutPage() {
	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.3]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-15%,oklch(0.55_0.18_195/0.35),transparent)]" />
			</div>

			<div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 py-10 md:py-16">
				<Link
					href="/"
					className={cn(
						buttonVariants({ variant: "ghost", size: "sm" }),
						"text-muted-foreground -ml-2 mb-8 gap-2",
					)}
				>
					<ArrowLeft className="size-4" />
					返回首页
				</Link>

				<div className="border-border/80 bg-card/35 mb-8 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<p className="text-primary mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
						<Sparkles className="size-3.5" />
						豹仔乐园
					</p>
					<h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
						关于我们
					</h1>
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
						豹仔乐园专注<strong className="text-foreground font-medium">
							日内交易培训
						</strong>
						，把枯燥的行情与规则做成可闯关、可量化的学习路径。我们相信交易能力可以像游戏一样「练级」——通过结构化课程、情境演练与即时反馈，帮助学员在低风险环境中形成稳定执行与风控习惯。
					</p>
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
						平台强调<strong className="text-foreground font-medium">
							科技感
						</strong>
						与<strong className="text-foreground font-medium">
							游戏化学习
						</strong>
						：进度可视、成就可感，让每一次练习都有方向。无论你是刚入门还是准备进阶，都能在这里找到适合自己的训练节奏。
					</p>
				</div>

				<section className="border-border/80 bg-card/25 mb-6 rounded-2xl border p-6 backdrop-blur-md">
					<h2 className="text-base font-semibold tracking-tight">团队与理念</h2>
					<p className="text-muted-foreground mt-3 text-sm leading-relaxed">
						核心团队由交易员、教研与产品组成，持续迭代课程内容与演练工具。我们重视复盘文化、风险边界与执行力——不承诺暴富，只交付可重复训练的方法论。
					</p>
				</section>

				<section className="border-border/80 bg-card/25 rounded-2xl border p-6 backdrop-blur-md">
					<h2 className="text-base font-semibold tracking-tight">联系方式</h2>
					<p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
						<Mail className="text-primary size-4 shrink-0" />
						<span>商务与合作：</span>
						<a
							href="mailto:hello@tradelovin.example"
							className="text-cyan-300 underline-offset-4 hover:underline"
						>
							hello@tradelovin.example
						</a>
						<span className="text-muted-foreground">（示例邮箱，后续可替换）</span>
					</p>
					<div className="mt-6">
						<Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
							立即报名
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
