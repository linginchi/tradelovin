import { ArrowLeft, Calendar, Clock, Link2, MapPin, User } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { buttonVariants } from "@/components/ui/button";
import type { CourseSchedule } from "@/lib/course-schedule";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export default async function MyCoursesPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("MyCourses");
	const tCommon = await getTranslations("Common");

	const raw = t.raw("schedule") as CourseSchedule[];
	const schedule = [...raw].sort((a, b) => a.date.localeCompare(b.date));

	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_45%_at_50%_0%,oklch(0.52_0.16_200/0.28),transparent)]" />
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

				{schedule.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("empty")}</p>
				) : (
					<ul className="space-y-4">
						{schedule.map((item) => (
							<li
								key={item.id}
								className="border-border/70 bg-card/35 hover:border-cyan-500/30 rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-colors"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-1">
										<p className="text-base font-semibold tracking-tight">
											{item.courseName}
										</p>
										<span
											className={cn(
												"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
												item.mode === "online"
													? "bg-violet-500/15 text-violet-200"
													: "bg-emerald-500/15 text-emerald-200",
											)}
										>
											{item.mode === "online" ? t("modeOnline") : t("modeOffline")}
										</span>
									</div>
								</div>
								<dl className="text-muted-foreground mt-4 grid gap-2 text-sm sm:grid-cols-2">
									<div className="flex items-center gap-2">
										<Calendar className="text-primary size-4 shrink-0" aria-hidden />
										<div>
											<dt className="text-[10px] uppercase tracking-wide opacity-80">
												{t("date")}
											</dt>
											<dd className="font-mono text-foreground tabular-nums">{item.date}</dd>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Clock className="text-primary size-4 shrink-0" aria-hidden />
										<div>
											<dt className="text-[10px] uppercase tracking-wide opacity-80">
												{t("time")}
											</dt>
											<dd className="text-foreground tabular-nums">
												{item.startTime}–{item.endTime}
											</dd>
										</div>
									</div>
									<div className="flex items-center gap-2 sm:col-span-2">
										<User className="text-primary size-4 shrink-0" aria-hidden />
										<div>
											<dt className="text-[10px] uppercase tracking-wide opacity-80">
												{t("instructor")}
											</dt>
											<dd className="text-foreground">{item.instructor}</dd>
										</div>
									</div>
									{item.location && (
										<div className="flex items-start gap-2 sm:col-span-2">
											{item.mode === "online" ? (
												<Link2 className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
											) : (
												<MapPin className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
											)}
											<div>
												<dt className="text-[10px] uppercase tracking-wide opacity-80">
													{t("location")}
												</dt>
												<dd className="text-foreground">{item.location}</dd>
											</div>
										</div>
									)}
								</dl>
							</li>
						))}
					</ul>
				)}
			</div>
		</main>
	);
}
