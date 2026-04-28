"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type CourseRow = {
	id: string;
	title: string;
	description: string | null;
	mode: string | null;
	start_date: string | null;
	end_date: string | null;
	location: string | null;
};

type RegRow = {
	status: string;
	courses?: { id: string } | null;
};

export function CoursesListClient() {
	const t = useTranslations("CoursesPage");
	const [rows, setRows] = useState<CourseRow[] | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [authed, setAuthed] = useState<boolean | null>(null);
	const [myStatus, setMyStatus] = useState<Record<string, string>>({});

	useEffect(() => {
		let alive = true;
		async function run() {
			const res = await fetch("/api/courses");
			const js = (await res.json()) as { courses?: CourseRow[]; error?: string };
			if (!alive) return;
			if (!res.ok) {
				setErr(js.error ?? "Error");
				setRows([]);
				return;
			}
			setRows(js.courses ?? []);

			const sb = getSupabaseBrowserClient();
			if (!sb) {
				setAuthed(false);
				return;
			}
			const { data: sess } = await sb.auth.getSession();
			if (!sess.session) {
				setAuthed(false);
				return;
			}
			setAuthed(true);
			const mr = await fetch("/api/courses/my-registrations", { credentials: "include" });
			const mjs = (await mr.json()) as {
				success?: boolean;
				registrations?: RegRow[];
			};
			if (mr.ok && mjs.registrations) {
				const map: Record<string, string> = {};
				for (const r of mjs.registrations) {
					const cid = r.courses?.id;
					if (cid) map[cid] = r.status;
				}
				setMyStatus(map);
			}
		}
		void run();
		return () => {
			alive = false;
		};
	}, []);

	if (rows === null && !err) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (err) {
		return <p className="text-destructive text-center text-sm">{err}</p>;
	}

	if (!rows?.length) {
		return <p className="text-muted-foreground text-center text-sm">{t("empty")}</p>;
	}

	return (
		<ul className="mx-auto grid max-w-3xl gap-4">
			{rows.map((c) => {
				const st = myStatus[c.id];
				return (
					<li
						key={c.id}
						className="border-border/80 bg-card/40 flex flex-col gap-3 rounded-xl border p-5 backdrop-blur-sm"
					>
						<div>
							<h2 className="text-lg font-semibold">{c.title}</h2>
							<p className="text-muted-foreground mt-1 text-xs">
								{c.mode === "online" ? t("modeOnline") : c.mode === "offline" ? t("modeOffline") : "—"}
								{c.start_date ? ` · ${c.start_date}` : ""}
							</p>
							{c.description ? (
								<p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{c.description}</p>
							) : null}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Link href={`/courses/${c.id}`}>
								<Button type="button" variant="outline" size="sm">
									{t("view")}
								</Button>
							</Link>
							{st ? (
								<span
									className={cn(
										"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
										st === "approved" && "bg-emerald-500/20 text-emerald-200",
										st === "rejected" && "bg-destructive/20 text-red-200",
										st === "pending" && "bg-amber-500/15 text-amber-100",
									)}
								>
									{st === "pending" ? t("pending") : st === "approved" ? t("approved") : t("rejected")}
								</span>
							) : authed === false ? (
								<span className="text-muted-foreground text-xs">{t("needLogin")}</span>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
