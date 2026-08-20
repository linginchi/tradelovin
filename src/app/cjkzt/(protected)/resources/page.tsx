import { AdminPublicResourcesPanel } from "@/components/admin/AdminPublicResourcesPanel";

export default function AdminSimResourcesPage() {
	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">模拟盘资源</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					全站应急模板。学员日常向金钱豹教练申请额度；教练在 /coach 设置自己的可发放库存。
				</p>
			</header>
			<AdminPublicResourcesPanel />
		</main>
	);
}
