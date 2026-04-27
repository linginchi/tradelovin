"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
	BookOpen,
	ChartCandlestick,
	GraduationCap,
	Sparkles,
	Users,
	Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button, buttonVariants } from "@/components/ui/button";
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

const courseIcons = [BookOpen, Zap, ChartCandlestick] as const;

const promoTabIcons = {
	courses: GraduationCap,
	mentors: Users,
} as const;

export default function Home() {
	const t = useTranslations("Home");
	const tCommon = useTranslations("Common");

	const highlights = useMemo(
		() => t.raw("highlights") as Array<{ title: string; desc: string; tag: string }>,
		[t],
	);
	const courseTracks = useMemo(
		() => t.raw("courseTracks") as Array<{ title: string; desc: string }>,
		[t],
	);
	const mentors = useMemo(
		() =>
			t.raw("mentors") as Array<{
				name: string;
				role: string;
				bio: string;
				skills: string[];
				initials: string;
			}>,
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
	const promoTabs = useMemo(
		() => t.raw("promoTabs") as Array<{ id: "courses" | "mentors"; label: string }>,
		[t],
	);

	const [promoTab, setPromoTab] = useState<(typeof promoTabs)[number]["id"]>("courses");

	return (
		<main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
			<div className="pointer-events-none absolute inset-0 right-4 top-4 z-20 flex justify-end md:right-8 md:top-6">
				<LanguageSwitcher />
			</div>
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
						{t("badge")}
					</p>
					<h1 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
						{t("title")}
					</h1>
					<p className="text-muted-foreground max-w-2xl text-pretty text-sm leading-relaxed md:text-base">
						{t("subtitle")}
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
						<Button
							type="button"
							size="lg"
							onClick={() => alert(tCommon("comingSoon"))}
						>
							{t("ctaTrading")}
						</Button>
						<Link
							href="/register"
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10",
							)}
						>
							{t("ctaRegister")}
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
							<h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
							<p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.desc}</p>
						</motion.article>
					))}
				</motion.div>

				<div className="w-full space-y-4">
					<div className="flex items-end justify-between gap-4">
						<div>
							<p className="text-primary flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
								<Sparkles className="size-3.5" />
								{t("promoKicker")}
							</p>
							<h2 className="mt-1 text-lg font-semibold tracking-tight md:text-xl">
								{t("promoTitle")}
							</h2>
							<p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t("promoSubtitle")}</p>
						</div>
					</div>

					<div
						className="border-border/60 bg-background/20 mb-3 flex gap-1 rounded-xl border p-1 md:hidden"
						role="tablist"
						aria-label={t("promoTablist")}
					>
						{promoTabs.map((tab) => {
							const Icon = promoTabIcons[tab.id];
							const active = promoTab === tab.id;
							return (
								<button
									key={tab.id}
									type="button"
									role="tab"
									aria-selected={active}
									onClick={() => setPromoTab(tab.id)}
									className={cn(
										"flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
										active
											? "bg-cyan-500/20 text-cyan-100 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.45)]"
											: "text-muted-foreground hover:bg-white/5",
									)}
								>
									<Icon className="size-4" aria-hidden />
									{tab.label}
								</button>
							);
						})}
					</div>

					<div className="hidden gap-6 md:grid md:grid-cols-2">
						<PromoCoursesCard courseTracks={courseTracks} />
						<PromoMentorsCard mentors={mentors} />
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
									<PromoCoursesCard courseTracks={courseTracks} />
								</motion.div>
							) : (
								<motion.div
									key="mentors"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.25 }}
								>
									<PromoMentorsCard mentors={mentors} />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
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
			</section>
		</main>
	);
}

function PromoCoursesCard({
	courseTracks,
}: {
	courseTracks: Array<{ title: string; desc: string }>;
}) {
	const t = useTranslations("Home");
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
					<h3 className="text-base font-semibold tracking-tight">{t("courseCardTitle")}</h3>
					<p className="text-muted-foreground text-xs">{t("courseCardSubtitle")}</p>
				</div>
			</div>
			<ul className="space-y-3">
				{courseTracks.map((c, idx) => {
					const Icon = courseIcons[idx] ?? BookOpen;
					const accents = [
						"from-cyan-500/25 to-transparent",
						"from-violet-500/20 to-transparent",
						"from-emerald-500/20 to-transparent",
					] as const;
					const accent = accents[idx] ?? accents[0];
					return (
						<li
							key={c.title}
							className={cn(
								"border-border/60 flex gap-3 rounded-xl border bg-black/20 p-3 transition-colors group-hover:border-border",
								"bg-linear-to-br to-transparent",
								accent,
							)}
						>
							<div className="bg-background/40 text-cyan-200/90 flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/5">
								<Icon className="size-5" />
							</div>
							<div>
								<p className="text-sm font-medium">{c.title}</p>
								<p className="text-muted-foreground mt-1 text-xs leading-relaxed">{c.desc}</p>
							</div>
						</li>
					);
				})}
			</ul>
		</motion.section>
	);
}

function PromoMentorsCard({
	mentors,
}: {
	mentors: Array<{
		name: string;
		role: string;
		bio: string;
		skills: string[];
		initials: string;
	}>;
}) {
	const t = useTranslations("Home");
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
					<h3 className="text-base font-semibold tracking-tight">{t("mentorCardTitle")}</h3>
					<p className="text-muted-foreground text-xs">{t("mentorCardSubtitle")}</p>
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
							<p className="text-muted-foreground mt-2 text-xs leading-relaxed">{m.bio}</p>
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
