"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type FormValues = {
	target_company: string;
	target_role: string;
	salary_expectation: string;
	location_preference: string;
	note: string;
	resume_url: string;
};

type ProgressRow = {
	id: string;
	step: string;
	status: string;
	notes: string | null;
	updated_at: string | null;
};

type TqResp = {
	totalScore: number;
	dimensions: {
		profitability: number;
		riskControl: number;
		consistency: number;
		activeness: number;
	};
};

function stepToTKey(step: string): CareerStepTKey | null {
	const map: Record<string, CareerStepTKey> = {
		resume_screening: "step_resume_screening",
		interview: "step_interview",
		assessment: "step_assessment",
		offer: "step_offer",
		onboarded: "step_onboarded",
	};
	return map[step] ?? null;
}

type CareerStepTKey =
	| "step_resume_screening"
	| "step_interview"
	| "step_assessment"
	| "step_offer"
	| "step_onboarded";

export function CareerIntentForm() {
	const router = useRouter();
	const t = useTranslations("CareerPage");
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState<ProgressRow[]>([]);
	const [hasApplication, setHasApplication] = useState(false);
	const [tqScore, setTqScore] = useState<TqResp | null>(null);

	const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
		defaultValues: {
			target_company: "",
			target_role: "",
			salary_expectation: "",
			location_preference: "",
			note: "",
			resume_url: "",
		},
	});

	useEffect(() => {
		let alive = true;
		async function run() {
			const sb = getSupabaseBrowserClient();
			if (!sb) {
				setReady(true);
				return;
			}
			const { data: sess } = await sb.auth.getSession();
			if (!sess.session) {
				router.replace("/login");
				return;
			}
			const res = await fetch("/api/job/my-application", { credentials: "include" });
			const js = (await res.json()) as {
				success?: boolean;
				application?: Record<string, unknown> | null;
				progress?: ProgressRow[];
			};
			if (alive && res.ok && js.application) {
				setHasApplication(true);
				setProgress(js.progress ?? []);
			}
			const tqRes = await fetch("/api/tq/score?env=sim&period=all", { credentials: "include" });
			const tqJson = (await tqRes.json()) as {
				success?: boolean;
				data?: { totalScore: number; dimensions: TqResp["dimensions"] };
			};
			if (alive && tqRes.ok && tqJson.success && tqJson.data) {
				setTqScore({
					totalScore: tqJson.data.totalScore,
					dimensions: tqJson.data.dimensions,
				});
			}
			if (alive) setReady(true);
		}
		void run();
		return () => {
			alive = false;
		};
	}, [router]);

	const onSubmit = async (values: FormValues) => {
		const res = await fetch("/api/job/apply", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				target_company: values.target_company.trim() || undefined,
				target_role: values.target_role.trim() || undefined,
				salary_expectation: values.salary_expectation.trim() || undefined,
				location_preference: values.location_preference.trim() || undefined,
				note: values.note.trim() || undefined,
				resume_url: values.resume_url.trim() || undefined,
			}),
		});
		const js = (await res.json()) as { success?: boolean; error?: string };
		if (!res.ok || !js.success) {
			toast.error(typeof js.error === "string" ? js.error : "Error");
			return;
		}
		toast.success(t("success"));
		const r2 = await fetch("/api/job/my-application", { credentials: "include" });
		const j2 = (await r2.json()) as { application?: unknown; progress?: ProgressRow[] };
		if (r2.ok && j2.application) {
			setHasApplication(true);
			setProgress(j2.progress ?? []);
		}
	};

	if (!ready) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	return (
		<>
			<div className="mx-auto w-full max-w-lg space-y-8">
				<section className="border-border/80 bg-card/40 rounded-xl border p-6 backdrop-blur-md">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">TradeQuotient</p>
					<p className="mt-1 text-2xl font-semibold">{tqScore ? tqScore.totalScore.toFixed(2) : "暂无评分"}</p>
					<p className="text-muted-foreground mt-1 text-xs">
						{tqScore
							? `盈利 ${tqScore.dimensions.profitability.toFixed(1)} · 风控 ${tqScore.dimensions.riskControl.toFixed(1)} · 一致性 ${tqScore.dimensions.consistency.toFixed(1)} · 活跃 ${tqScore.dimensions.activeness.toFixed(1)}`
							: "该分数将用于求职推荐与晋级筛选。"}
					</p>
				</section>
				{hasApplication && progress.length > 0 ? (
					<section className="border-border/80 bg-card/40 rounded-xl border p-6 backdrop-blur-md">
						<h2 className="text-base font-semibold">{t("progressTitle")}</h2>
						<p className="text-muted-foreground mt-1 text-sm">{t("submitted")}</p>
						<ol className="mt-4 space-y-3">
							{progress.map((p) => {
								const tk = stepToTKey(p.step);
								const label = tk ? t(tk) : p.step;
								const st =
									p.status === "completed"
										? t("status_completed")
										: p.status === "rejected"
											? t("status_rejected")
											: t("status_pending");
								return (
									<li
										key={p.id}
										className="border-border/60 flex flex-col gap-1 rounded-lg border bg-black/15 px-3 py-2 text-sm"
									>
										<span className="font-medium">{label}</span>
										<span
											className={cn(
												"text-xs",
												p.status === "completed" && "text-emerald-300",
												p.status === "rejected" && "text-red-300",
												p.status === "pending" && "text-muted-foreground",
											)}
										>
											{st}
										</span>
										{p.notes ? <span className="text-muted-foreground text-xs">{p.notes}</span> : null}
									</li>
								);
							})}
						</ol>
					</section>
				) : null}

				<form
					onSubmit={handleSubmit(onSubmit)}
					className="border-border/80 bg-card/40 space-y-5 rounded-xl border p-6 shadow-sm backdrop-blur-md md:p-8"
				>
					<div className="space-y-1">
						<h1 className="text-xl font-semibold">{t("title")}</h1>
						<p className="text-muted-foreground text-sm">{t("intro")}</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="target_company">{t("targetCompany")}</Label>
						<Input id="target_company" {...register("target_company")} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="target_role">{t("targetRole")}</Label>
						<Input id="target_role" {...register("target_role")} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="salary">{t("salary")}</Label>
						<Input id="salary" {...register("salary_expectation")} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="location">{t("location")}</Label>
						<Input id="location" {...register("location_preference")} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="resume_url">{t("resumeUrl")}</Label>
						<Input id="resume_url" type="url" placeholder="https://..." {...register("resume_url")} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="note">{t("note")}</Label>
						<Textarea id="note" rows={4} {...register("note")} />
					</div>

					<Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
						{isSubmitting ? t("submitting") : t("submit")}
					</Button>
				</form>
			</div>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
