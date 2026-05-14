"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function MagicLinkPage() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const qs = new URLSearchParams();
		const token = searchParams.get("token");
		const next = searchParams.get("next");
		if (token) qs.set("token", token);
		if (next && next.startsWith("/") && !next.startsWith("//")) qs.set("next", next);
		window.location.replace(`/api/auth/magic-link?${qs.toString()}`);
	}, [searchParams]);

	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
			<Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
			<p className="text-sm font-medium">正在验证，请稍候...</p>
		</div>
	);
}
