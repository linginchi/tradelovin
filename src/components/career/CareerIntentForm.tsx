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

type FormValues = {
	target_company: string;
	target_role: string;
	salary_expectation: string;
	location_preference: string;
	note: string;
};

export function CareerIntentForm() {
	const router = useRouter();
	const t = useTranslations("CareerPage");
	const [ready, setReady] = useState(false);

	const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
		defaultValues: {
			target_company: "",
			target_role: "",
			salary_expectation: "",
			location_preference: "",
			note: "",
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
				router.replace("/register");
				return;
			}
			if (alive) setReady(true);
		}
		run();
		return () => {
			alive = false;
		};
	}, [router]);

	const onSubmit = async (values: FormValues) => {
		const res = await fetch("/api/career", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				target_company: values.target_company.trim() || undefined,
				target_role: values.target_role.trim() || undefined,
				salary_expectation: values.salary_expectation.trim() || undefined,
				location_preference: values.location_preference.trim() || undefined,
				note: values.note.trim() || undefined,
			}),
		});
		const js = (await res.json()) as { success?: boolean; error?: string };
		if (!res.ok || !js.success) {
			toast.error(typeof js.error === "string" ? js.error : "Error");
			return;
		}
		toast.success(t("success"));
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
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-5 rounded-xl border p-6 shadow-sm backdrop-blur-md md:p-8"
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
					<Label htmlFor="note">{t("note")}</Label>
					<Textarea id="note" rows={4} {...register("note")} />
				</div>

				<Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
					{isSubmitting ? t("submitting") : t("submit")}
				</Button>
			</form>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
