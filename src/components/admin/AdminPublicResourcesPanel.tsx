"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TradeV2PublicResourceItem } from "@/lib/trade-v2/api-types";

type FormState = {
	symbol: string;
	name: string;
	long_limit: string;
	short_limit: string;
};

const EMPTY_FORM: FormState = {
	symbol: "",
	name: "",
	long_limit: "100000",
	short_limit: "100000",
};

export function AdminPublicResourcesPanel() {
	const [rows, setRows] = useState<TradeV2PublicResourceItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/admin/resources/public", { credentials: "include" });
			const json = (await res.json()) as {
				success?: boolean;
				data?: TradeV2PublicResourceItem[];
				error?: string;
			};
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "加载公共资源失败");
				return;
			}
			setRows(json.data ?? []);
		} catch {
			toast.error("加载公共资源失败");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function save() {
		setSaving(true);
		try {
			const res = await fetch("/api/admin/resources/public", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					symbol: form.symbol,
					name: form.name || undefined,
					long_limit: Number(form.long_limit),
					short_limit: Number(form.short_limit),
				}),
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "保存失败");
				return;
			}
			toast.success("已保存为全站应急模板。日常请在考核盘资源栏加库存，不要在这里发学员额度。");
			setForm(EMPTY_FORM);
			await load();
		} catch {
			toast.error("保存失败");
		} finally {
			setSaving(false);
		}
	}

	async function remove(symbol: string) {
		if (!window.confirm(`确定从公共池删除 ${symbol}？仍有学员占用额度时无法删除。`)) {
			return;
		}
		try {
			const res = await fetch(`/api/admin/resources/public?symbol=${encodeURIComponent(symbol)}`, {
				method: "DELETE",
				credentials: "include",
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "删除失败");
				return;
			}
			toast.success(`已删除 ${symbol}`);
			await load();
		} catch {
			toast.error("删除失败");
		}
	}

	function fillForm(row: TradeV2PublicResourceItem) {
		setForm({
			symbol: row.symbol,
			name: row.name ?? "",
			long_limit: String(row.long_limit),
			short_limit: String(row.short_limit),
		});
	}

	return (
		<div className="space-y-6">
			<section className="space-y-3 rounded-lg border p-4">
				<h2 className="text-sm font-medium">新增 / 更新标的</h2>
				<p className="text-muted-foreground text-xs">
					这里写入的是公共可申请库存。学员必须先在交易页「资源」申请个人额度，才能开仓。
				</p>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1.5">
						<Label htmlFor="admin-resource-symbol">标的代码</Label>
						<Input
							id="admin-resource-symbol"
							value={form.symbol}
							onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))}
							placeholder="600000 或 600519.SH"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="admin-resource-name">名称（可选）</Label>
						<Input
							id="admin-resource-name"
							value={form.name}
							onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
							placeholder="浦发银行"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="admin-resource-long">可做多数量</Label>
						<Input
							id="admin-resource-long"
							value={form.long_limit}
							onChange={(e) => setForm((prev) => ({ ...prev, long_limit: e.target.value }))}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="admin-resource-short">可做空数量</Label>
						<Input
							id="admin-resource-short"
							value={form.short_limit}
							onChange={(e) => setForm((prev) => ({ ...prev, short_limit: e.target.value }))}
						/>
					</div>
				</div>
				<Button type="button" disabled={saving} onClick={() => void save()}>
					{saving ? "保存中..." : "保存到公共池"}
				</Button>
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium">当前公共池</h2>
					<Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
						刷新
					</Button>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>标的</TableHead>
							<TableHead>名称</TableHead>
							<TableHead className="text-end">可做多</TableHead>
							<TableHead className="text-end">可做空</TableHead>
							<TableHead className="text-end">操作</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground text-center">
									加载中...
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground text-center">
									池是空的。请先在上方加入至少一只标的，例如 600000.SH 或 600519.SH。
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="font-medium">{row.symbol}</TableCell>
									<TableCell>{row.name ?? "—"}</TableCell>
									<TableCell className="text-end">{row.long_limit}</TableCell>
									<TableCell className="text-end">{row.short_limit}</TableCell>
									<TableCell className="text-end">
										<div className="flex justify-end gap-2">
											<Button type="button" variant="outline" size="sm" onClick={() => fillForm(row)}>
												编辑
											</Button>
											<Button type="button" variant="outline" size="sm" onClick={() => void remove(row.symbol)}>
												删除
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</section>
		</div>
	);
}
