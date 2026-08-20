import { AdminPublicResourcesPanel } from "@/components/admin/AdminPublicResourcesPanel";

export default function AdminSimResourcesPage() {
	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">模拟盘资源</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					全站应急模板，日常不要在这里加资源。学员在考核盘「资源」栏提出添加（审核中）；教练在同一栏加库存、批准或直接发放。任命教练请到讲师页。
				</p>
			</header>
			<AdminPublicResourcesPanel />
		</main>
	);
}
