"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { cn } from "@/lib/utils";

export function CoachDeskNavLink({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
	const tNav = useTranslations("Nav");
	const { status } = useAuth();
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (status !== "authenticated") {
			setShow(false);
			return;
		}
		let cancelled = false;
		void fetch("/api/coach/me", { credentials: "include" })
			.then(async (res) => {
				const json = (await res.json()) as { data?: { isCoach?: boolean; canOpenDesk?: boolean } };
				if (!cancelled) setShow(Boolean(json.data?.isCoach));
			})
			.catch(() => {
				if (!cancelled) setShow(false);
			});
		return () => {
			cancelled = true;
		};
	}, [status]);

	if (!show) return null;
	return (
		<Link href="/coach" onClick={onNavigate} className={cn("text-amber-200 hover:text-amber-100 transition-colors", className)}>
			{tNav("coachDesk")}
		</Link>
	);
}
