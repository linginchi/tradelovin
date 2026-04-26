import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

function MiniRadar({
	axes,
	label,
}: {
	axes: Array<{ key: string; value: number }>;
	label: string;
}) {
	const n = axes.length;
	const center = 50;
	const maxR = 38;
	const points = axes
		.map((axis, i) => {
			const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
			const r = (axis.value / 100) * maxR;
			const x = center + r * Math.cos(angle);
			const y = center + r * Math.sin(angle);
			return `${x},${y}`;
		})
		.join(" ");

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

	const spokes = axes.map((_, i) => {
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
				aria-label={label}
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
				{axes.map((axis) => (
					<li key={axis.key}>
						<div className="mb-1 flex justify-between text-xs">
							<span className="text-muted-foreground">{axis.key}</span>
							<span className="font-mono tabular-nums text-cyan-300">{axis.value}</span>
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

export default async function MyScoresPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("MyScores");
	const tCommon = await getTranslations("Common");

	const axes = t.raw("axes") as Array<{ key: string; value: number }>;
	const exams = t.raw("exams") as Array<{
		name: string;
		score: number;
		grade: string;
		date: string;
	}>;

	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_80%_0%,oklch(0.55_0.18_195/0.3),transparent)]" />
			</div>

			<div className="absolute right-4 top-4 z-20 md:right-8 md:top-6">
				<LanguageSwitcher />
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
					{tCommon("backHome")}
				</Link>

				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("title")}</h1>
					<p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">{t("profileTitle")}</h2>
					<p className="text-muted-foreground mt-1 text-xs md:text-sm">{t("profileHint")}</p>
					<div className="mt-6">
						<MiniRadar axes={axes} label={t("radarLabel")} />
					</div>
				</section>

				<section className="border-border/80 bg-card/30 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">{t("examTitle")}</h2>
					<ul className="mt-4 space-y-3">
						{exams.map((row) => (
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
									<span className="text-cyan-300/90 text-xs font-medium">{row.grade}</span>
								</div>
							</li>
						))}
					</ul>
				</section>
			</div>
		</main>
	);
}
