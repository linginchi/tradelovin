import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EXAM_RESULTS = [
	{
		name: "日内结构与关键位",
		score: 88,
		grade: "优良",
		date: "2026-04-12",
	},
	{
		name: "风控与仓位管理",
		score: 76,
		grade: "良好",
		date: "2026-04-01",
	},
	{
		name: "执行纪律模拟测",
		score: 92,
		grade: "优秀",
		date: "2026-03-18",
	},
];

const PROFILE_AXES = [
	{ key: "技术面", value: 85 },
	{ key: "风控", value: 72 },
	{ key: "心态", value: 68 },
	{ key: "执行", value: 90 },
	{ key: "复盘", value: 79 },
];

function MiniRadar() {
	const n = PROFILE_AXES.length;
	const center = 50;
	const maxR = 38;
	const points = PROFILE_AXES.map((axis, i) => {
		const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
		const r = (axis.value / 100) * maxR;
		const x = center + r * Math.cos(angle);
		const y = center + r * Math.sin(angle);
		return `${x},${y}`;
	}).join(" ");

	const gridRings = [0.25, 0.5, 0.75, 1].map((t) => (
		<circle
			key={t}
			cx={center}
			cy={center}
			r={maxR * t}
			fill="none"
			className="stroke-border/60"
			strokeWidth={0.5}
		/>
	));

	const spokes = PROFILE_AXES.map((_, i) => {
		const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
		const x2 = center + maxR * Math.cos(angle);
		const y2 = center + maxR * Math.sin(angle);
		return (
			<line
				key={i}
				x1={center}
				y1={center}
				x2={x2}
				y2={y2}
				className="stroke-border/50"
				strokeWidth={0.5}
			/>
		);
	});

	return (
		<div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:gap-8">
			<svg
				viewBox="0 0 100 100"
				className="size-44 shrink-0 text-cyan-400/90 md:size-52"
				role="img"
				aria-label="能力画像雷达图（演示数据）"
			>
				{gridRings}
				{spokes}
				<polygon
					points={points}
					fill="oklch(0.75 0.14 195 / 0.35)"
					stroke="oklch(0.78 0.14 195)"
					strokeWidth={1}
				/>
			</svg>
			<ul className="grid w-full max-w-sm gap-2 text-sm">
				{PROFILE_AXES.map((axis) => (
					<li key={axis.key}>
						<div className="mb-1 flex justify-between text-xs">
							<span className="text-muted-foreground">{axis.key}</span>
							<span className="font-mono tabular-nums text-cyan-300">
								{axis.value}
							</span>
						</div>
						<div className="bg-muted/40 h-2 overflow-hidden rounded-full">
							<div
								className="h-full rounded-full bg-linear-to-r from-cyan-600/80 to-cyan-400/90"
								style={{ width: `${axis.value}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function MyScoresPage() {
	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_80%_0%,oklch(0.55_0.18_195/0.3),transparent)]" />
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
						我的成绩
					</h1>
					<p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
						以下为演示数据，用于页面结构预览。后续接入登录与真实成绩接口后，将仅对本人展示。
					</p>
				</header>

				<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">能力画像</h2>
					<p className="text-muted-foreground mt-1 text-xs md:text-sm">
						雷达图 + 维度进度条（Mock）
					</p>
					<div className="mt-6">
						<MiniRadar />
					</div>
				</section>

				<section className="border-border/80 bg-card/30 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">考试成绩</h2>
					<ul className="mt-4 space-y-3">
						{EXAM_RESULTS.map((row) => (
							<li
								key={row.name}
								className="border-border/60 flex flex-col gap-2 rounded-xl border bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p className="text-sm font-medium">{row.name}</p>
									<p className="text-muted-foreground text-xs">{row.date}</p>
								</div>
								<div className="flex items-baseline gap-3 sm:text-right">
									<span className="text-primary font-mono text-lg font-semibold tabular-nums">
										{row.score}
									</span>
									<span className="text-cyan-300/90 text-xs font-medium">
										{row.grade}
									</span>
								</div>
							</li>
						))}
					</ul>
				</section>
			</div>
		</main>
	);
}
