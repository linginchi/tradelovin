"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { FlaskConical, GraduationCap, LineChart, PlaySquare, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Toaster } from "sonner";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import { DevTestQuickLoginCard } from "@/components/auth/DevTestQuickLoginCard";
import { HomeHeroBackground } from "@/components/home/HomeHeroBackground";
import { HomeUpgradeCta } from "@/components/home/HomeUpgradeCta";
import { Link } from "@/i18n/navigation";
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

type HeroEntry = {
	href: string;
	label: string;
	icon: typeof PlaySquare;
};

export function HomePageClient() {
	const t = useTranslations("Home");

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

	const entries: HeroEntry[] = [
		{ href: "/courses", label: t("entries.video"), icon: PlaySquare },
		{ href: "/trade", label: t("entries.trade"), icon: LineChart },
		{ href: "/lab", label: t("entries.lab"), icon: FlaskConical },
		{ href: "/my-learning", label: t("entries.classroom"), icon: GraduationCap },
	];

	return (
		<main className="relative flex min-h-full flex-1 flex-col overflow-x-hidden">
			<section className="relative flex min-h-[78svh] w-full flex-col items-center justify-center overflow-hidden px-6 py-20 text-center md:min-h-[82svh] md:py-28">
				<HomeHeroBackground />

				<motion.div
					className="flex w-full max-w-3xl flex-col items-center gap-6"
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
				>
					<h1 className="w-full text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] md:text-5xl md:leading-[1.1]">
						{t("title")}
					</h1>

					<div className="mt-2 flex flex-col flex-wrap items-stretch justify-center gap-3 sm:flex-row sm:items-center">
						{entries.map(({ href, label, icon: Icon }) => (
							<Link
								key={href}
								href={href}
								className={cn(
									"inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold tracking-tight text-white backdrop-blur-md transition-all duration-200 outline-none hover:border-white/60 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 md:text-base",
								)}
							>
								<Icon className="size-5 shrink-0" aria-hidden />
								{label}
							</Link>
						))}
					</div>
				</motion.div>
			</section>

			<div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 md:py-20">
				<motion.section
					className="w-full"
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.45 }}
				>
					<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold tracking-tight md:text-xl">{t("honorTitle")}</h2>
							<p className="text-muted-foreground mt-1 text-sm">{t("honorSubtitle")}</p>
						</div>
						<HomeUpgradeCta />
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
					className="border-border/50 bg-card/15 text-muted-foreground w-full rounded-xl border px-4 py-5 shadow-sm backdrop-blur-sm md:px-6 md:py-6"
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
			</div>
			<Toaster richColors theme="dark" position="top-center" />
		</main>
	);
}
