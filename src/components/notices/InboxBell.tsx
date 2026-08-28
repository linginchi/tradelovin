"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { markNoticesRead, unreadCount, type AppNotice } from "@/lib/notices/notices";

function formatNoticeTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
}

export function InboxBell() {
	const t = useTranslations("Nav");
	const [open, setOpen] = useState(false);
	const [notices, setNotices] = useState<AppNotice[]>([]);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/notices", { credentials: "include" });
			const payload = (await res.json()) as { success?: boolean; data?: AppNotice[] };
			if (res.ok && payload.success && Array.isArray(payload.data)) {
				setNotices(payload.data);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (open) void load();
	}, [load, open]);

	const unread = unreadCount(notices);

	async function markRead(ids: string[] | "all") {
		const now = new Date().toISOString();
		setNotices((current) => markNoticesRead(current, ids, now));
		await fetch("/api/notices/read", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
		});
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={unread > 0 ? t("inboxUnread", { count: unread }) : t("inbox")}
				className="text-muted-foreground hover:text-foreground relative inline-flex size-9 items-center justify-center rounded-lg transition-colors"
			>
				<Bell className="size-4" aria-hidden />
				{unread > 0 ? (
					<span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-orange-500" aria-hidden />
				) : null}
			</button>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="right" closeLabel={t("inbox")} className="w-[86%] max-w-sm gap-0">
					<SheetHeader className="border-border/60 border-b">
						<SheetTitle>{t("inbox")}</SheetTitle>
					</SheetHeader>
					<ScrollArea className="min-h-0 flex-1">
						<div className="space-y-2 px-4 py-3">
							{loading && notices.length === 0 ? (
								<p className="text-muted-foreground text-sm">{t("inboxLoading")}</p>
							) : null}
							{!loading && notices.length === 0 ? (
								<p className="text-muted-foreground text-sm">{t("inboxEmpty")}</p>
							) : null}
							{notices.map((notice) => (
								<button
									key={notice.id}
									type="button"
									onClick={() => {
										if (!notice.read_at) void markRead([notice.id]);
									}}
									className="hover:bg-white/5 w-full rounded-lg border border-cyan-500/15 px-3 py-2.5 text-left transition-colors"
								>
									<p className="flex items-start justify-between gap-2 text-sm font-medium">
										<span>{notice.title}</span>
										{!notice.read_at ? (
											<span className="mt-1 size-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
										) : null}
									</p>
									<p className="text-muted-foreground mt-1 text-xs leading-relaxed whitespace-pre-wrap">
										{notice.body}
									</p>
									<p className="text-muted-foreground/80 mt-1.5 text-[11px]">
										{formatNoticeTime(notice.created_at)}
									</p>
								</button>
							))}
						</div>
					</ScrollArea>
					<SheetFooter className="border-border/60 border-t">
						<Button
							type="button"
							variant="outline"
							disabled={unread === 0}
							onClick={() => void markRead("all")}
						>
							{t("markAllRead")}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</>
	);
}
