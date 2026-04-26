"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
	BookOpen,
	ChartCandlestick,
	GraduationCap,
	Sparkles,
	Users,
	Zap,
} from "lucide-react";

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

const courseTracks = [
	{
		title: "基础入门",
		desc: "术语、图表、节奏与风险边界，建立可重复的交易日流程。",
		icon: BookOpen,
		accent: "from-cyan-500/25 to-transparent",
	},
	{
		title: "实战进阶",
		desc: "情境任务与模拟盘联动，训练执行、仓位与复盘闭环。",
		icon: Zap,
		accent: "from-violet-500/20 to-transparent",
	},
	{
		title: "大师班",
		desc: "高阶策略拆解与实盘思维陪练，面向稳定盈利与资金管理。",
		icon: ChartCandlestick,
		accent: "from-emerald-500/20 to-transparent",
	},
];

const mentors = [
	{
		name: "林策",
		role: "首席教研 · 日内结构",
		bio: "十年+衍生品与日内经验，擅长把行情结构讲成可练的「关卡」。",
		skills: ["关键位", "波动节奏", "复盘方法"],
		initials: "林",
	},
	{
		name: "周砚",
		role: "风控顾问 · 仓位与执行",
		bio: "专注交易心理与执行纪律，帮学员把规则固化成肌肉记忆。",
		skills: ["仓位管理", "执行纪律", "回撤控制"],
		initials: "周",
	},
	{
		name: "沈澜",
		role: "实战导师 · 情境演练",
		bio: "设计高强度模拟任务，让错误发生在课堂里而不是真实账户。",
		skills: ["模拟演练", "情境压力", "反馈闭环"],
		initials: "沈",
	},
];

const honorGraduates = [
	{
		name: "学员 · 青岚",
		destination: "某头部自营交易台",
		role: "日内交易员",
		achievement: "三个月内通过考核并独立操盘小组策略",
	},
	{
		name: "学员 · 北辰",
		destination: "资管公司 · 量化研究部",
		role: "分析师（衍生品方向）",
		achievement: "参与期货套利与波动率策略研究项目",
	},
	{
		name: "学员 · 琥珀",
		destination: "自主创业 · 独立交易",
		role: "独立交易员",
		achievement: "建立自有风控体系，稳定运行两个季度",
	},
	{
		name: "学员 · 黎川",
		destination: "家族办公室",
		role: "投资助理（全球宏观）",
		achievement: "协助搭建日内与波段结合的战术组合",
	},
	{
		name: "学员 · 星渚",
		destination: "券商自营部门",
		role: "做市与套利助理",
		achievement: "完成实盘轮岗并通过内部风控认证",
	},
];

const promoTabs = [
	{ id: "courses" as const, label: "课程体系", icon: GraduationCap },
	{ id: "mentors" as const, label: "导师团队", icon: Users },
];

export default function Home() {
	const [promoTab, setPromoTab] = useState<(typeof promoTabs)[number]["id"]>(
		"courses",
	);

	return (
		<main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.35]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.55_0.18_195/0.35),transparent)]" />
				<div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.2_0_0/0.08)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.2_0_0/0.08)_1px,transparent_1px)] bg-size-[48px_48px]" />
			</div>

			<section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 py-16 md:gap-12 md:py-24">
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
						没有什么能够阻挡你成为大交易员的向往
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
						<Button type="button" size="lg" onClick={() => alert("待连接")}>
							进入教学交易系统
						</Button>
						<Link
							href="/register"
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10",
							)}
						>
							立即报名
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

				{/* 动态宣传：课程 + 导师 */}
				<div className="w-full space-y-4">
					<div className="flex items-end justify-between gap-4">
						<div>
							<p className="text-primary flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
								<Sparkles className="size-3.5" />
								核心亮点
							</p>
							<h2 className="mt-1 text-lg font-semibold tracking-tight md:text-xl">
								课程体系与导师团队
							</h2>
							<p className="text-muted-foreground mt-1 max-w-2xl text-sm">
								深色毛玻璃卡片，悬浮动效；小屏可用 Tab 切换，大屏并排展示。
							</p>
						</div>
					</div>

					<div
						className="border-border/60 bg-background/20 mb-3 flex gap-1 rounded-xl border p-1 md:hidden"
						role="tablist"
						aria-label="宣传区切换"
					>
						{promoTabs.map((t) => {
							const Icon = t.icon;
							const active = promoTab === t.id;
							return (
								<button
									key={t.id}
									type="button"
									role="tab"
									aria-selected={active}
									onClick={() => setPromoTab(t.id)}
									className={cn(
										"flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
										active
											? "bg-cyan-500/20 text-cyan-100 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.45)]"
											: "text-muted-foreground hover:bg-white/5",
									)}
								>
									<Icon className="size-4" aria-hidden />
									{t.label}
								</button>
							);
						})}
					</div>

					<div className="hidden gap-6 md:grid md:grid-cols-2">
						<PromoCoursesCard />
						<PromoMentorsCard />
					</div>

					<div className="md:hidden">
						<AnimatePresence mode="wait">
							{promoTab === "courses" ? (
								<motion.div
									key="courses"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.25 }}
								>
									<PromoCoursesCard />
								</motion.div>
							) : (
								<motion.div
									key="mentors"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.25 }}
								>
									<PromoMentorsCard />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* 毕业豹仔荣誉榜 */}
				<motion.section
					className="w-full"
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.45 }}
				>
					<div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold tracking-tight md:text-xl">
								毕业豹仔荣誉榜
							</h2>
							<p className="text-muted-foreground mt-1 text-sm">
								毕业学员的优秀出路与岗位（示例展示）
							</p>
						</div>
					</div>
					<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{honorGraduates.map((g, i) => (
							<motion.li
								key={g.name}
								initial={{ opacity: 0, y: 10 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.4, delay: i * 0.05 }}
								className="group border-border/70 bg-card/35 hover:border-cyan-500/35 relative overflow-hidden rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.25),0_18px_40px_-24px_oklch(0.55_0.18_195/0.35)]"
							>
								<div
									className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
									aria-hidden
								>
									<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,oklch(0.55_0.18_195/0.12),transparent_55%)]" />
								</div>
								<div className="relative flex gap-4">
									<div
										className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-linear-to-br from-cyan-500/25 to-transparent text-lg font-bold text-cyan-100 shadow-inner"
										aria-hidden
									>
										豹
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold">{g.name}</p>
										<p className="text-muted-foreground mt-0.5 text-xs">
											{g.destination}
										</p>
										<p className="text-cyan-200/90 mt-2 text-xs font-medium">
											{g.role}
										</p>
										<p className="text-muted-foreground mt-2 text-xs leading-relaxed">
											{g.achievement}
										</p>
									</div>
								</div>
							</motion.li>
						))}
					</ul>
				</motion.section>
			</section>
		</main>
	);
}

function PromoCoursesCard() {
	return (
		<motion.section
			className="border-border/80 bg-card/30 group h-full rounded-2xl border p-6 shadow-sm backdrop-blur-md transition-all hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.2)]"
			initial={{ opacity: 0, y: 10 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.4 }}
		>
			<div className="mb-4 flex items-center gap-2">
				<div className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-lg">
					<GraduationCap className="size-5" />
				</div>
				<div>
					<h3 className="text-base font-semibold tracking-tight">课程介绍</h3>
					<p className="text-muted-foreground text-xs">核心课程体系</p>
				</div>
			</div>
			<ul className="space-y-3">
				{courseTracks.map((c) => {
					const Icon = c.icon;
					return (
						<li
							key={c.title}
							className={cn(
								"border-border/60 flex gap-3 rounded-xl border bg-black/20 p-3 transition-colors group-hover:border-border",
								"bg-linear-to-br to-transparent",
								c.accent,
							)}
						>
							<div className="bg-background/40 text-cyan-200/90 flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/5">
								<Icon className="size-5" />
							</div>
							<div>
								<p className="text-sm font-medium">{c.title}</p>
								<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
									{c.desc}
								</p>
							</div>
						</li>
					);
				})}
			</ul>
		</motion.section>
	);
}

function PromoMentorsCard() {
	return (
		<motion.section
			className="border-border/80 bg-card/30 group h-full rounded-2xl border p-6 shadow-sm backdrop-blur-md transition-all hover:-translate-y-1 hover:border-violet-400/25 hover:shadow-[0_0_0_1px_oklch(0.65_0.14_280/0.22)]"
			initial={{ opacity: 0, y: 10 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.4, delay: 0.05 }}
		>
			<div className="mb-4 flex items-center gap-2">
				<div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
					<Users className="size-5" />
				</div>
				<div>
					<h3 className="text-base font-semibold tracking-tight">导师介绍</h3>
					<p className="text-muted-foreground text-xs">实战派带教</p>
				</div>
			</div>
			<ul className="space-y-3">
				{mentors.map((m) => (
					<li
						key={m.name}
						className="border-border/60 flex gap-3 rounded-xl border bg-black/20 p-3 transition-colors hover:border-violet-400/20"
					>
						<div
							className="flex size-11 shrink-0 items-center justify-center rounded-full border border-violet-400/35 bg-linear-to-br from-violet-500/30 to-cyan-500/10 text-sm font-bold text-white shadow-inner"
							aria-hidden
						>
							{m.initials}
						</div>
						<div className="min-w-0">
							<p className="text-sm font-semibold">{m.name}</p>
							<p className="text-muted-foreground text-xs">{m.role}</p>
							<p className="text-muted-foreground mt-2 text-xs leading-relaxed">
								{m.bio}
							</p>
							<div className="mt-2 flex flex-wrap gap-1.5">
								{m.skills.map((s) => (
									<span
										key={s}
										className="border-violet-400/20 bg-violet-500/10 text-violet-100/90 rounded-full border px-2 py-0.5 text-[10px] font-medium"
									>
										{s}
									</span>
								))}
							</div>
						</div>
					</li>
				))}
			</ul>
		</motion.section>
	);
}
