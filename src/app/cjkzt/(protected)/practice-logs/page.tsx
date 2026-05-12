import { redirect } from "next/navigation";

import { AdminPracticeLogsPanel } from "@/components/admin/AdminPracticeLogsPanel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { ADMIN_BASE_PATH } from "@/lib/admin/paths";

export default async function CjkztPracticeLogsPage() {
	const session = await getAdminSession();
	if (!session) {
		redirect(`${ADMIN_BASE_PATH}/login`);
	}
	if (session.role !== "super_admin") {
		redirect(ADMIN_BASE_PATH);
	}

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">练习日志管理</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">
					查看用户练习明细、筛选日志并导出 CSV，用于训练流程优化与问题排查。
				</p>
			</header>
			<AdminPracticeLogsPanel />
		</main>
	);
}
