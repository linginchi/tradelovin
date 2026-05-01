"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AdminTqConfigPanel() {
	const [featureWeightsText, setFeatureWeightsText] = useState("");
	const [dimensionWeightsText, setDimensionWeightsText] = useState("");
	const [busy, setBusy] = useState(false);
	const [recalcEnv, setRecalcEnv] = useState<"sim" | "live">("sim");
	const [recalcPeriod, setRecalcPeriod] = useState<"all" | "monthly" | "weekly" | "daily">("all");
	const [targetUserId, setTargetUserId] = useState("");
	const [certTier, setCertTier] = useState<"auto" | "T1" | "T2" | "T3">("auto");
	const [baselineUsers, setBaselineUsers] = useState<Array<{ user_id: string; added_at: string }>>([]);

	useEffect(() => {
		let alive = true;
		void (async () => {
			const res = await fetch("/api/admin/tq-config");
			const json = (await res.json()) as {
				success?: boolean;
				config?: { featureWeights?: unknown; dimensionWeights?: unknown };
				error?: string;
			};
			if (!alive) return;
			if (!res.ok || !json.success || !json.config) {
				toast.error(json.error ?? "加载评分配置失败");
				return;
			}
			setFeatureWeightsText(JSON.stringify(json.config.featureWeights ?? {}, null, 2));
			setDimensionWeightsText(JSON.stringify(json.config.dimensionWeights ?? {}, null, 2));
			const baselineRes = await fetch("/api/admin/tq-baseline");
			const baselineJson = (await baselineRes.json()) as {
				success?: boolean;
				users?: Array<{ user_id: string; added_at: string }>;
			};
			if (baselineRes.ok && baselineJson.success) {
				setBaselineUsers(baselineJson.users ?? []);
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	async function saveConfig() {
		try {
			setBusy(true);
			const featureWeights = JSON.parse(featureWeightsText);
			const dimensionWeights = JSON.parse(dimensionWeightsText);
			const res = await fetch("/api/admin/tq-config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ featureWeights, dimensionWeights }),
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "保存评分配置失败");
				return;
			}
			toast.success("评分配置已保存");
		} catch {
			toast.error("JSON 格式错误，请检查后再保存");
		} finally {
			setBusy(false);
		}
	}

	async function recalculate() {
		setBusy(true);
		try {
			const res = await fetch("/api/tq/recalculate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environment: recalcEnv,
					period: recalcPeriod,
					userId: targetUserId.trim() || undefined,
				}),
			});
			const json = (await res.json()) as { success?: boolean; message?: string; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "重算失败");
				return;
			}
			toast.success(json.message ?? "重算完成");
		} finally {
			setBusy(false);
		}
	}

	async function reissueCertificate() {
		if (!targetUserId.trim()) {
			toast.error("请先输入 user_id");
			return;
		}
		setBusy(true);
		try {
			const res = await fetch("/api/admin/tq-certificates/reissue", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: targetUserId.trim(),
					env: recalcEnv,
					period: recalcPeriod,
					tier: certTier === "auto" ? undefined : certTier,
				}),
			});
			const json = (await res.json()) as {
				success?: boolean;
				error?: string;
				data?: { pdfUrl?: string; imageUrl?: string };
			};
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "证书重签发失败");
				return;
			}
			toast.success("证书重签发完成");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4">
			<section className="space-y-2">
				<h2 className="text-base font-semibold">特征权重（feature_weights）</h2>
				<Textarea
					value={featureWeightsText}
					onChange={(e) => setFeatureWeightsText(e.target.value)}
					rows={20}
					className="font-mono text-xs"
				/>
			</section>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">维度权重（dimension_weights）</h2>
				<Textarea
					value={dimensionWeightsText}
					onChange={(e) => setDimensionWeightsText(e.target.value)}
					rows={10}
					className="font-mono text-xs"
				/>
			</section>
			<div className="flex flex-wrap gap-2">
				<Button disabled={busy} onClick={() => void saveConfig()}>
					保存配置
				</Button>
				<Button variant="outline" disabled={busy} onClick={() => void recalculate()}>
					重算全部用户
				</Button>
				<Button variant="outline" disabled={busy} onClick={() => void reissueCertificate()}>
					重签发 TQ 证书
				</Button>
			</div>
			<div className="grid gap-2 rounded-xl border border-border/70 p-3 md:grid-cols-4">
				<select
					value={recalcEnv}
					onChange={(e) => setRecalcEnv(e.target.value === "live" ? "live" : "sim")}
					className="bg-background border-border rounded-md border px-2 py-1 text-sm"
				>
					<option value="sim">模拟环境</option>
					<option value="live">实盘环境</option>
				</select>
				<select
					value={recalcPeriod}
					onChange={(e) =>
						setRecalcPeriod(
							e.target.value === "monthly" || e.target.value === "weekly" || e.target.value === "daily"
								? e.target.value
								: "all",
						)
					}
					className="bg-background border-border rounded-md border px-2 py-1 text-sm"
				>
					<option value="all">全历史</option>
					<option value="monthly">近30天</option>
					<option value="weekly">近7天</option>
					<option value="daily">近1天</option>
				</select>
				<Input
					value={targetUserId}
					onChange={(e) => setTargetUserId(e.target.value)}
					placeholder="可选：指定 user_id"
					className="md:col-span-2"
				/>
				<select
					value={certTier}
					onChange={(e) =>
						setCertTier(
							e.target.value === "T1" || e.target.value === "T2" || e.target.value === "T3"
								? e.target.value
								: "auto",
						)
					}
					className="bg-background border-border rounded-md border px-2 py-1 text-sm md:col-span-2"
				>
					<option value="auto">证书等级：自动按会员</option>
					<option value="T1">证书等级：T1</option>
					<option value="T2">证书等级：T2</option>
					<option value="T3">证书等级：T3</option>
				</select>
			</div>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">基准用户预览（最近 50 条）</h2>
				<div className="rounded-xl border border-border/70 p-3 text-xs">
					{baselineUsers.length ? (
						<ul className="space-y-1 font-mono">
							{baselineUsers.map((row) => (
								<li key={`${row.user_id}-${row.added_at}`} className="truncate">
									{row.user_id} · {new Date(row.added_at).toLocaleString("zh-CN", { hour12: false })}
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground">暂无基准用户数据</p>
					)}
				</div>
			</section>
		</div>
	);
}
