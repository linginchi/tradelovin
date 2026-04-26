"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const highlights = [
	{
		title: "结构化课程",
		desc: "从基础到进阶的路径设计，把复杂概念拆成可执行的小步练习。",
		tag: "体系化",
	},
	{
		title: "实战演练",
		desc: "模拟盘与情境任务结合，在低风险环境里反复试错、形成肌肉记忆。",
		tag: "可练习",
	},
	{
		title: "即时反馈",
		desc: "每一次操作都有清晰评分与提示，知道自己强在哪、下一步该练什么。",
		tag: "可量化",
	},
];

const leaderboardPreview = [
	{ rank: 1, name: "雪豹 · 匿名", score: 9820 },
	{ rank: 2, name: "云豹 · 匿名", score: 9410 },
	{ rank: 3, name: "猎豹 · 匿名", score: 9033 },
	{ rank: 4, name: "你（占位）", score: "—", dim: true },
];

const badgePlaceholders = ["首单完成", "连续 7 天", "风控达人", "复盘之星", "?", "?"];

export default function Home() {
	return (
		<main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.35]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.55_0.18_195/0.35),transparent)]" />
				<div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.2_0_0/0.08)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.2_0_0/0.08)_1px,transparent_1px)] bg-size-[48px_48px]" />
			</div>

			<section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 py-16 md:py-24">
				<motion.div
					className="flex flex-col items-center gap-5 text-center"
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
				>
					<p className="text-primary border-primary/25 bg-primary/10 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide uppercase">
						豹仔乐园 · 游戏化交易学习
					</p>
					<h1 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
						豹仔乐园 — 挖掘你的交易天赋
					</h1>
					<p className="text-muted-foreground max-w-2xl text-pretty text-sm leading-relaxed md:text-base">
						用关卡、徽章与排行榜，把枯燥的训练变成可持续进步的游戏。适合想系统入门、又讨厌死记硬背的你。
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
						<Button size="lg" render={<Link href="/trade" />}>
							进入交易系统
						</Button>
						<Link
							href="/register"
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10",
							)}
						>
							立即注册
						</Link>
					</div>
				</motion.div>

				<motion.div
					className="grid w-full gap-4 md:grid-cols-3"
					initial="hidden"
					animate="show"
					variants={{
						hidden: {},
						show: { transition: { staggerChildren: 0.08 } },
					}}
				>
					{highlights.map((item) => (
						<motion.article
							key={item.title}
							variants={{
								hidden: { opacity: 0, y: 12 },
								show: { opacity: 1, y: 0 },
							}}
							transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
							className="border-border/80 bg-card/40 hover:border-primary/25 relative rounded-xl border p-5 shadow-sm backdrop-blur-sm transition-colors"
						>
							<span className="text-primary mb-2 inline-block text-xs font-medium">
								{item.tag}
							</span>
							<h2 className="text-base font-semibold tracking-tight">
								{item.title}
							</h2>
							<p className="text-muted-foreground mt-2 text-sm leading-relaxed">
								{item.desc}
							</p>
						</motion.article>
					))}
				</motion.div>

				<div className="grid w-full gap-6 md:grid-cols-2">
					<motion.section
						className="border-border/80 bg-card/30 rounded-xl border p-5 backdrop-blur-sm"
						initial={{ opacity: 0, y: 12 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.45 }}
					>
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-sm font-semibold tracking-tight">
								排行榜预览
							</h3>
							<span className="text-muted-foreground text-xs">占位数据</span>
						</div>
						<ul className="space-y-2">
							{leaderboardPreview.map((row) => (
								<li
									key={row.rank}
									className={cn(
										"border-border/60 flex items-center justify-between rounded-lg border bg-black/20 px-3 py-2 text-sm",
										row.dim && "opacity-60",
									)}
								>
									<span className="text-muted-foreground w-6 font-mono text-xs">
										#{row.rank}
									</span>
									<span className="flex-1 truncate pl-2">{row.name}</span>
									<span className="text-primary font-mono text-xs tabular-nums">
										{row.score}
									</span>
								</li>
							))}
						</ul>
					</motion.section>

					<motion.section
						className="border-border/80 bg-card/30 rounded-xl border p-5 backdrop-blur-sm"
						initial={{ opacity: 0, y: 12 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.45, delay: 0.06 }}
					>
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-sm font-semibold tracking-tight">徽章墙</h3>
							<span className="text-muted-foreground text-xs">即将解锁</span>
						</div>
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
							{badgePlaceholders.map((label, i) => (
								<div
									key={`${label}-${i}`}
									className="border-border/60 flex aspect-square flex-col items-center justify-center rounded-lg border bg-linear-to-br from-cyan-500/10 to-transparent p-2 text-center"
								>
									<span className="text-lg opacity-80">🏅</span>
									<span className="text-muted-foreground mt-1 text-[10px] leading-tight">
										{label}
									</span>
								</div>
							))}
						</div>
					</motion.section>
				</div>
			</section>
		</main>
	);
}
