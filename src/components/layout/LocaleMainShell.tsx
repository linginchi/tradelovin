"use client";

import { usePathname } from "@/i18n/navigation";

import { SiteFooter } from "@/components/shared/SiteFooter";

type Props = {
	children: React.ReactNode;
};

/** 前台显示页脚；管理后台 `/cjkzt` 去掉，避免与后台顶栏/布局叠层 */
export function LocaleMainShell({ children }: Props) {
	const pathname = usePathname();
	const isAdmin = pathname.includes("/cjkzt");

	return (
		<div className="flex min-h-full flex-1 flex-col">
			{children}
			{!isAdmin ? <SiteFooter /> : null}
		</div>
	);
}
