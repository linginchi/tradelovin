import { ArrowLeft, Calendar, Clock, Link2, MapPin, User } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { EnrolledCourse } from "@/lib/course-schedule";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

function isHttpUrl(value: string) {
	return /^https?:\/\//i.test(value.trim());
}

export default async function MyCoursesPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("MyCourses");
	const tCommon = await getTranslations("Common");

	const raw = t.raw("enrolledCourses") as EnrolledCourse[];
	const courses = raw.map((c) => ({
		...c,
		schedules: [...c.schedules].sort((a, b) => a.date.localeCompare(b.date)),
	}));
	courses.sort((a, b) => {
		const ad = a.schedules[0]?.date ?? "";
		const bd = b.schedules[0]?.date ?? "";
		return ad.localeCompare(bd);
	});

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

				{courses.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("empty")}</p>
				) : (
					<ul className="space-y-5">
						{courses.map((course) => (
							<li
								key={course.id}
								className="border-border/70 bg-card/35 rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-colors hover:border-cyan-500/30"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-2">
										<p className="text-base font-semibold tracking-tight">{course.name}</p>
										<Badge
											variant={
												course.status === "in_progress" ? "success" : "warning"
											}
										>
											{course.status === "in_progress"
												? t("statusInProgress")
												: t("statusPending")}
										</Badge>
									</div>
								</div>

								<p className="text-muted-foreground mt-5 text-[10px] font-semibold uppercase tracking-wide">
									{t("sessionsHeading")}
								</p>
								<ul className="mt-3 space-y-4 border-border/50 divide-y divide-border/40 rounded-xl border bg-black/10 p-3 dark:bg-black/20">
									{course.schedules.map((item) => (
										<li key={item.id} className="pt-4 first:pt-0">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant={item.mode === "online" ? "online" : "offline"}>
													{item.mode === "online" ? t("modeOnline") : t("modeOffline")}
												</Badge>
											</div>
											<dl className="text-muted-foreground mt-3 grid gap-2 text-sm sm:grid-cols-2">
												<div className="flex items-center gap-2">
													<Calendar className="text-primary size-4 shrink-0" aria-hidden />
													<div>
														<dt className="text-[10px] uppercase tracking-wide opacity-80">
															{t("date")}
														</dt>
														<dd className="font-mono text-foreground tabular-nums">
															{item.date}
														</dd>
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Clock className="text-primary size-4 shrink-0" aria-hidden />
													<div>
														<dt className="text-[10px] uppercase tracking-wide opacity-80">
															{t("time")}
														</dt>
														<dd className="text-foreground tabular-nums">
															{item.startTime} — {item.endTime}
														</dd>
													</div>
												</div>
												{item.instructor && (
													<div className="flex items-center gap-2 sm:col-span-2">
														<User className="text-primary size-4 shrink-0" aria-hidden />
														<div>
															<dt className="text-[10px] uppercase tracking-wide opacity-80">
																{t("instructor")}
															</dt>
															<dd className="text-foreground">{item.instructor}</dd>
														</div>
													</div>
												)}
												{item.location && (
													<div className="flex items-start gap-2 sm:col-span-2">
														{item.mode === "online" ? (
															<Link2
																className="text-primary mt-0.5 size-4 shrink-0"
																aria-hidden
															/>
														) : (
															<MapPin
																className="text-primary mt-0.5 size-4 shrink-0"
																aria-hidden
															/>
														)}
														<div className="min-w-0">
															<dt className="text-[10px] uppercase tracking-wide opacity-80">
																{t("location")}
															</dt>
															<dd className="text-foreground break-words">
																{isHttpUrl(item.location) ? (
																	<a
																		href={item.location}
																		target="_blank"
																		rel="noopener noreferrer"
																		className="text-primary font-medium underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
																	>
																		{item.location}
																	</a>
																) : (
																	item.location
																)}
															</dd>
														</div>
													</div>
												)}
											</dl>
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				)}
			</div>
		</main>
	);
}
