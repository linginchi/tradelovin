import Link from "next/link";
import { ArrowLeft, Building2, GraduationCap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROFILE = {
	nickname: "雪豹学员 · Demo",
	email: "demo@tradelovin.example",
	phone: "138****0000",
};

const ENROLLED = [
	{ name: "日内基础入门", progress: "进行中 · 第 4 周", status: "学习中" },
	{ name: "实战进阶营", progress: "未开课", status: "待开始" },
];

const JOB_PIPELINE = [
	{
		company: "某自营交易台",
		steps: ["简历初筛", "交易考核", "面试", "Offer"],
		current: 2,
	},
	{
		company: "资管公司 A",
		steps: ["简历初筛", "笔试", "面试"],
		current: 1,
	},
	{
		company: "独立交易员路径",
		steps: ["方案提交", "模拟盘复核", "签约意向"],
		current: 0,
	},
];

function Stepper({
	steps,
	current,
}: {
	steps: string[];
	current: number;
}) {
	return (
		<ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1">
			{steps.map((label, i) => {
				const done = i < current;
				const active = i === current;
				return (
					<li key={label} className="flex items-center gap-1 text-xs sm:contents">
						<span
							className={cn(
								"inline-flex items-center rounded-full px-2.5 py-1 font-medium",
								done && "bg-cyan-500/20 text-cyan-200",
								active &&
									"bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/50",
								!done &&
									!active &&
									"bg-muted/30 text-muted-foreground",
							)}
						>
							{label}
						</span>
						{i < steps.length - 1 && (
							<span
								className="text-muted-foreground hidden px-1 sm:inline"
								aria-hidden
							>
								→
							</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}

export default function MyProfilePage() {
	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,oklch(0.5_0.16_260/0.28),transparent)]" />
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

				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
						我的
					</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						个人资料、课程与求职进度（演示数据）
					</p>
				</header>

				<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
						<GraduationCap className="text-primary size-5" />
						个人资料
					</h2>
					<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground text-xs">昵称</dt>
							<dd className="mt-0.5 font-medium">{PROFILE.nickname}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">邮箱</dt>
							<dd className="mt-0.5 break-all">{PROFILE.email}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">手机号</dt>
							<dd className="mt-0.5 font-mono">{PROFILE.phone}</dd>
						</div>
					</dl>
				</section>

				<section className="border-border/80 bg-card/30 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">报名课程</h2>
					<ul className="mt-4 space-y-3">
						{ENROLLED.map((c) => (
							<li
								key={c.name}
								className="border-border/60 rounded-xl border bg-black/20 px-4 py-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium">{c.name}</p>
									<span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
										{c.status}
									</span>
								</div>
								<p className="text-muted-foreground mt-1 text-xs">{c.progress}</p>
							</li>
						))}
					</ul>
				</section>

				<section className="border-border/80 bg-card/30 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
						<Building2 className="text-primary size-5" />
						求职进度
					</h2>
					<ul className="mt-4 space-y-5">
						{JOB_PIPELINE.map((job) => (
							<li
								key={job.company}
								className="border-border/60 rounded-xl border bg-black/15 px-4 py-3"
							>
								<p className="text-sm font-semibold">{job.company}</p>
								<Stepper steps={job.steps} current={job.current} />
							</li>
						))}
					</ul>
				</section>
			</div>
		</main>
	);
}
