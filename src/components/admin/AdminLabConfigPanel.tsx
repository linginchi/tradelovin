"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resolveAdminModelSelection } from "@/lib/lab/admin-model-select";

type ProviderHealth = {
	id: "volcano";
	configured: boolean;
	visionCapable: boolean;
	models: string[];
	reason?: string;
};

type ActiveModel = {
	provider: "volcano";
	modelId: string;
};

export function AdminLabConfigPanel() {
	const [active, setActive] = useState<ActiveModel | null>(null);
	const [providers, setProviders] = useState<ProviderHealth[]>([]);
	const [modelId, setModelId] = useState("pending-spike");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const res = await fetch("/api/admin/lab-config", { credentials: "include" });
		const json = (await res.json()) as {
			success?: boolean;
			active?: ActiveModel;
			providers?: ProviderHealth[];
			error?: string;
		};
		if (!res.ok || !json.success || !json.active) {
			toast.error(json.error ?? "加载实验室配置失败");
			return;
		}
		setActive(json.active);
		setProviders(json.providers ?? []);
		const volcanoHealth = (json.providers ?? []).find((p) => p.id === "volcano");
		setModelId(resolveAdminModelSelection(json.active.modelId, volcanoHealth?.models ?? []));
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	const selectedHealth = useMemo(
		() => providers.find((p) => p.id === "volcano"),
		[providers],
	);

	const selectableModels = selectedHealth?.models ?? [];
	const canSave = Boolean(
		selectedHealth?.configured &&
			selectedHealth.visionCapable &&
			selectableModels.includes(modelId.trim()),
	);

	async function save() {
		if (!canSave) {
			toast.error(selectedHealth?.reason ?? "该模型未通过健康检查，无法切换");
			return;
		}
		setBusy(true);
		try {
			const res = await fetch("/api/admin/lab-config", {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "volcano", modelId }),
			});
			const json = (await res.json()) as {
				success?: boolean;
				active?: ActiveModel;
				providers?: ProviderHealth[];
				error?: string;
			};
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "保存失败");
				return;
			}
			setActive(json.active ?? null);
			setProviders(json.providers ?? providers);
			toast.success("实验室模型已更新（仅影响新建诊断）");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			<section className="rounded-xl border border-border/70 p-4">
				<h2 className="text-sm font-semibold">当前启用</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					{active
						? `${active.provider} / ${active.modelId}`
						: "加载中…"}
				</p>
				<p className="text-muted-foreground mt-2 text-xs">
					API Key 仅存 VPS，不会出现在本页或数据库。切换只影响新建诊断；历史报告保留当时模型。
				</p>
			</section>

			<section className="space-y-3 rounded-xl border border-border/70 p-4">
				<h2 className="text-sm font-semibold">切换模型</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label>提供商</Label>
						<p className="border-input bg-muted/40 flex h-9 w-full items-center rounded-md border px-2 text-sm">
							火山（volcano）
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="lab-model">模型 ID</Label>
						{selectableModels.length > 0 ? (
							<select
								id="lab-model"
								className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
								value={modelId}
								onChange={(e) => setModelId(e.target.value)}
							>
								{selectableModels.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						) : (
							<select
								id="lab-model"
								className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
								value="pending-spike"
								disabled
							>
								<option value="pending-spike">pending-spike</option>
							</select>
						)}
					</div>
				</div>

				<div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
					<p>
						状态：
						{selectedHealth?.configured && selectedHealth.visionCapable
							? "可用（已配置且支持视觉）"
							: "不可用"}
					</p>
					{selectedHealth?.reason ? <p className="mt-1">原因：{selectedHealth.reason}</p> : null}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button type="button" onClick={() => void save()} disabled={busy || !canSave}>
						{busy ? "保存中…" : "保存"}
					</Button>
					<Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>
						刷新健康检查
					</Button>
				</div>
			</section>

			<section className="rounded-xl border border-border/70 p-4">
				<h2 className="text-sm font-semibold">提供商健康一览</h2>
				<ul className="mt-3 space-y-2 text-sm">
					{providers.map((p) => (
						<li key={p.id} className="rounded-lg border border-border/50 px-3 py-2">
							<div className="font-medium">
								{p.id} · configured={String(p.configured)} · vision={String(p.visionCapable)}
							</div>
							{p.models.length ? (
								<p className="text-muted-foreground text-xs">models: {p.models.join(", ")}</p>
							) : null}
							{p.reason ? <p className="text-muted-foreground text-xs">{p.reason}</p> : null}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
