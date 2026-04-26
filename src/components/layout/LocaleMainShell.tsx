"use client";

import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { BottomNavShell } from "@/components/layout/BottomNavShell";

type Props = {
	children: React.ReactNode;
};

/** 前台保留底部导航与安全区留白；管理后台 `/admin` 去掉，避免与后台顶栏叠层 */
export function LocaleMainShell({ children }: Props) {
	const pathname = usePathname();
	const isAdmin = pathname.includes("/admin");

	return (
		<>
			<div
				className={cn(
					"flex min-h-full flex-1 flex-col",
					!isAdmin &&
						"pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
				)}
			>
				{children}
			</div>
			{!isAdmin ? <BottomNavShell /> : null}
		</>
	);
}
