"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AdminTqConfigPanel() {
	const [featureWeightsText, setFeatureWeightsText] = useState("");
	const [dimensionWeightsText, setDimensionWeightsText] = useState("");
	const [busy, setBusy] = useState(false);

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
				body: JSON.stringify({ environment: "sim", period: "all" }),
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
			</div>
		</div>
	);
}
