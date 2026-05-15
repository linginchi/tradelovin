"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ShieldAlert, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Toaster } from "sonner";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import { DevTestQuickLoginCard } from "@/components/auth/DevTestQuickLoginCard";
import { UpcomingCourseTeaser } from "@/components/home/UpcomingCourseTeaser";
import { buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const HonorGraduatesGrid = dynamic(
	() => import("@/components/home/HonorGraduatesGrid"),
	{
		loading: () => <HonorGraduatesSkeleton />,
	},
);

function HonorGraduatesSkeleton() {
	return (
		<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
			{[0, 1, 2].map((k) => (
				<li
					key={k}
					className="border-border/60 bg-muted/15 h-36 animate-pulse rounded-2xl border"
				/>
			))}
		</ul>
	);
}

export default function Home() {
	const t = useTranslations("Home");
	const router = useRouter();

	const highlights = useMemo(
		() => t.raw("highlights") as Array<{ title: string; desc: string; tag: string }>,
		[t],
	);
	const honorGraduates = useMemo(
		() =>
			t.raw("honorGraduates") as Array<{
				name: string;
				destination: string;
				role: string;
				achievement: string;
			}>,
		[t],
	);
	return (
		<main className="relative flex min-h-full flex-1 flex-col overflow-x-hidden">
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
					<h1 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
						{t("title")}
					</h1>
					<p className="text-muted-foreground max-w-2xl text-pretty text-sm leading-relaxed md:text-base">
						{t("subtitle")}
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
						<Link
							href="/trade"
							className={cn(buttonVariants({ size: "lg" }))}
						>
							{t("ctaTrading")}
						</Link>
						<Link
							href="/my-learning"
							className={cn(
								buttonVariants({ size: "lg" }),
								"border border-orange-300/70 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-[0_10px_24px_-12px_rgba(251,146,60,0.75)]",
								"hover:from-orange-500 hover:via-orange-500 hover:to-amber-500",
							)}
						>
							{t("hero.classroomButton")}
						</Link>
					</div>
				</motion.div>

				<div className="flex w-full justify-center">
					<UpcomingCourseTeaser />
				</div>

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
							className="border-border/80 bg-card/40 hover:border-primary/25 relative cursor-pointer rounded-xl border p-5 shadow-sm backdrop-blur-sm transition-colors"
							onClick={() => router.push("/courses")}
						>
							<span className="text-primary mb-2 inline-block text-xs font-medium">
								{item.tag}
							</span>
							<h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
							<p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.desc}</p>
						</motion.article>
					))}
				</motion.div>

				<div className="w-full space-y-4">
					<p className="text-primary flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
						<Sparkles className="size-3.5" />
						{t("promoKicker")}
					</p>
					<motion.section
						className="border-border/80 bg-card/30 hover:border-cyan-500/30 rounded-2xl border p-6 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.2),0_18px_40px_-28px_oklch(0.55_0.18_195/0.25)] md:p-8"
						initial={{ opacity: 0, y: 12 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
					>
						<h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
							{t("promoTitle")}
						</h2>
						<p className="text-muted-foreground mt-4 max-w-3xl text-sm leading-relaxed md:text-base">
							{t("promoSubtitle")}
						</p>
						<p className="text-muted-foreground mt-6 border-border/50 border-t pt-4 text-xs leading-relaxed md:text-sm">
							{t("promoPartners")}
						</p>
					</motion.section>
				</div>

				<motion.section
					className="w-full"
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.45 }}
				>
					<div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold tracking-tight md:text-xl">{t("honorTitle")}</h2>
							<p className="text-muted-foreground mt-1 text-sm">{t("honorSubtitle")}</p>
						</div>
					</div>
					<LazyWhenVisible
						minHeight={200}
						rootMargin="200px"
						fallback={<HonorGraduatesSkeleton />}
					>
						<HonorGraduatesGrid honorGraduates={honorGraduates} />
					</LazyWhenVisible>
				</motion.section>

				<div
					className="border-border/50 bg-card/15 text-muted-foreground w-full max-w-5xl rounded-xl border px-4 py-5 shadow-sm backdrop-blur-sm md:px-6 md:py-6"
					role="note"
				>
					<p className="text-primary/90 mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-wide uppercase">
						<ShieldAlert className="size-3.5 shrink-0" aria-hidden />
						{t("complianceTitle")}
					</p>
					<p className="text-[11px] leading-relaxed md:text-xs">{t("complianceDisclaimer")}</p>
				</div>

				<div className="w-full max-w-lg">
					<DevTestQuickLoginCard showToaster idPrefix="home-dev-test" />
				</div>
			</section>
			<Toaster richColors theme="dark" position="top-center" />
		</main>
	);
}
