import { ArrowLeft, Building2, GraduationCap } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

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
								!done && !active && "bg-muted/30 text-muted-foreground",
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

export default async function MyProfilePage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("MyProfile");
	const tCommon = await getTranslations("Common");

	const enrolled = t.raw("enrolled") as Array<{
		name: string;
		progress: string;
		status: string;
	}>;
	const jobs = t.raw("jobs") as Array<{
		company: string;
		steps: string[];
		current: number;
	}>;

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
					{tCommon("backHome")}
				</Link>

				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("title")}</h1>
					<p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<Link
							href="/my-courses"
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							{t("myCoursesLink")}
						</Link>
					</div>
				</header>

				<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
						<GraduationCap className="text-primary size-5" />
						{t("profileTitle")}
					</h2>
					<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground text-xs">{t("nickname")}</dt>
							<dd className="mt-0.5 font-medium">{t("demoNickname")}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">{t("email")}</dt>
							<dd className="mt-0.5 break-all">{t("demoEmail")}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">{t("phone")}</dt>
							<dd className="mt-0.5 font-mono">{t("demoPhone")}</dd>
						</div>
					</dl>
				</section>

				<section className="border-border/80 bg-card/30 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="text-base font-semibold tracking-tight">{t("coursesTitle")}</h2>
					<ul className="mt-4 space-y-3">
						{enrolled.map((c) => (
							<li
								key={c.name}
								className="border-border/60 flex flex-col rounded-xl border bg-black/20 px-4 py-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium">{c.name}</p>
									<span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
										{c.status}
									</span>
								</div>
								<p className="text-muted-foreground mt-1 text-xs">{c.progress}</p>
								<div className="mt-3 flex justify-end border-border/40 border-t pt-3">
									<Link
										href="/my-courses"
										className={cn(
											buttonVariants({ variant: "outline", size: "sm" }),
											"shrink-0",
										)}
									>
										{t("courseCardScheduleCta")}
									</Link>
								</div>
							</li>
						))}
					</ul>
				</section>

				<section className="border-border/80 bg-card/30 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
						<Building2 className="text-primary size-5" />
						{t("jobTitle")}
					</h2>
					<ul className="mt-4 space-y-5">
						{jobs.map((job) => (
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
