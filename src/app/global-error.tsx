"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[global-error]", error);
	}, [error]);

	return (
		<html lang="zh-CN">
			<body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
				<div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">页面暂时不可用</h2>
					<p className="text-sm text-muted-foreground">
						系统遇到异常，已自动记录。请稍后重试，如仍有问题可通过页面右下角反馈入口联系我们。
					</p>
					<div className="flex gap-2">
						<Button type="button" onClick={() => reset()}>
							重试
						</Button>
						<Button type="button" variant="outline" onClick={() => window.location.assign("/login?next=/my-learning")}>
							返回登录
						</Button>
					</div>
				</div>
			</body>
		</html>
	);
}
