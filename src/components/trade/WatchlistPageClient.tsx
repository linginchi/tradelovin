"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import {
	isCanonicalCnSymbol,
	normalizeCnSymbol,
	SYMBOL_INPUT_HINT_MESSAGE,
} from "@/lib/trade/symbol-normalizer";
import {
	formatFailurePriorityTagByScore,
	resolveFailurePriority,
	resolveFailureSymbol,
} from "@/lib/trade-v2/failure-priority";
import { formatFailureDiagnostic } from "@/lib/trade-v2/failure-diagnostic";
import { buildExecutionResultView } from "@/lib/trade-v2/execution-copy";
import {
	buildFailureListHref,
	buildTradeFailureHref,
	normalizeSymbolFilter,
	parseViewParam,
} from "@/lib/trade-v2/failure-query";
import type {
	ApiResponse,
	TradeV2WatchlistCheckSummary,
	TradeV2WatchlistItem,
} from "@/lib/trade-v2/api-types";
import type { RiskFailureRow } from "@/lib/trade-v2/failure-types";

type AlertType = "price_above" | "price_below" | "percent_up" | "percent_down";

type WatchItem = TradeV2WatchlistItem;

type RiskFailure = RiskFailureRow;

function formatRiskDiagnostic(item: RiskFailure): string {
	return formatFailureDiagnostic({
		code: item.code,
		content: item.content,
		createdAt: item.created_at,
		meta: item.meta,
	});
}

const ALERT_LABEL: Record<AlertType, string> = {
	price_above: "价格上破",
	price_below: "价格下破",
	percent_up: "涨幅到达",
	percent_down: "跌幅到达",
};

const VIEW_LABEL: Record<"all" | "pending" | "triggered" | "failed", string> = {
	all: "全部",
	pending: "仅待触发",
	triggered: "仅已触发",
	failed: "失败关联",
};

export default function WatchlistPageClient() {
	const searchParams = useSearchParams();
	const [symbol, setSymbol] = useState("600000.SH");
	const [alertType, setAlertType] = useState<AlertType>("price_above");
	const [alertPrice, setAlertPrice] = useState("10");
	const [items, setItems] = useState<WatchItem[]>([]);
	const [riskFailures, setRiskFailures] = useState<RiskFailure[]>([]);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string>("");
	const [checkResult, setCheckResult] = useState<TradeV2WatchlistCheckSummary | null>(null);

	const pendingCount = useMemo(() => items.filter((x) => !x.triggered).length, [items]);
	const triggeredCount = useMemo(() => items.filter((x) => x.triggered).length, [items]);
	const viewFilter = parseViewParam(searchParams.get("view"), ["all", "pending", "triggered", "failed"] as const, "all");
	const symbolFilter = normalizeSymbolFilter(searchParams.get("symbol"));
	const failedSymbols = useMemo(() => {
		return new Set(
			riskFailures
				.map((item) => resolveFailureSymbol(item))
				.filter(Boolean),
		);
	}, [riskFailures]);
	const filteredItems = useMemo(() => {
		return items.filter((item) => {
			if (viewFilter === "pending" && item.triggered) return false;
			if (viewFilter === "triggered" && !item.triggered) return false;
			if (viewFilter === "failed" && !failedSymbols.has(item.symbol.toUpperCase())) return false;
			if (symbolFilter && item.symbol.toUpperCase() !== symbolFilter) return false;
			return true;
		});
	}, [failedSymbols, items, symbolFilter, viewFilter]);
	const prioritizedRiskFailures = useMemo(
		() =>
			[...riskFailures].sort((a, b) => {
				const scoreDiff = resolveFailurePriority(b) - resolveFailurePriority(a);
				if (scoreDiff !== 0) return scoreDiff;
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			}),
		[riskFailures],
	);
	const latestFailureDiagnostics = useMemo(
		() => prioritizedRiskFailures.slice(0, 3).map((item) => formatRiskDiagnostic(item)),
		[prioritizedRiskFailures],
	);
	const tradeReturnHref = useMemo(() => {
		if (viewFilter !== "failed") return "/trade";
		return buildTradeFailureHref(symbolFilter);
	}, [symbolFilter, viewFilter]);

	const loadItems = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const [listRes, riskRes] = await Promise.all([
				fetch("/api/watchlist", { cache: "no-store" }),
				fetch("/api/risk/messages", { cache: "no-store" }),
			]);
			const [listJson, riskJson] = (await Promise.all([
				listRes.json(),
				riskRes.json(),
			])) as [ApiResponse<WatchItem[]>, ApiResponse<RiskFailure[]>];
			if (!listRes.ok || !listJson.success) {
				throw new Error(listJson.error ?? "读取监控列表失败");
			}
			if (!riskRes.ok || !riskJson.success) {
				throw new Error(riskJson.error ?? "读取风控失败摘要失败");
			}
			setItems(listJson.data ?? []);
			setRiskFailures(
				(riskJson.data ?? []).filter(
					(x) => x.code === "ORDER_REJECTED" || x.code === "BROKER_SIM_DROP",
				),
			);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "读取监控列表失败");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			void loadItems();
		}, 0);
		return () => clearTimeout(timer);
	}, [loadItems]);

	const createItem = useCallback(async () => {
		const price = Number(alertPrice);
		const normalizedSymbol = normalizeCnSymbol(symbol);
		if (!isCanonicalCnSymbol(normalizedSymbol)) {
			setMessage(SYMBOL_INPUT_HINT_MESSAGE);
			return;
		}
		if (!Number.isFinite(price) || price <= 0) {
			setMessage("请输入有效阈值");
			return;
		}
		setMessage("");
		const res = await fetch("/api/watchlist", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				symbol: normalizedSymbol,
				alertType,
				alertPrice: price,
			}),
		});
		const json = (await res.json()) as ApiResponse<WatchItem>;
		if (!res.ok || !json.success) {
			setMessage(json.error ?? "新增监控失败");
			return;
		}
		setAlertPrice("");
		setSymbol(normalizedSymbol);
		await loadItems();
	}, [alertPrice, alertType, loadItems, symbol]);

	const deleteItem = useCallback(
		async (id: string) => {
			setMessage("");
			const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
			const json = (await res.json()) as ApiResponse<unknown>;
			if (!res.ok || !json.success) {
				setMessage(json.error ?? "删除监控失败");
				return;
			}
			await loadItems();
		},
		[loadItems],
	);

	const checkTriggers = useCallback(async () => {
		setMessage("");
		setCheckResult(null);
		const res = await fetch("/api/watchlist/check", { method: "POST" });
		const json = (await res.json()) as ApiResponse<TradeV2WatchlistCheckSummary>;
		if (!res.ok || !json.success) {
			setMessage(json.error ?? "触发检查失败");
			return;
		}
		setCheckResult(json.data ?? null);
		await loadItems();
	}, [loadItems]);

	const copyLatestFailureDiagnostics = useCallback(async () => {
		if (latestFailureDiagnostics.length === 0) {
			toast.error("暂无失败诊断串可复制");
			return;
		}
		const payload = latestFailureDiagnostics.join("\n");
		try {
			await navigator.clipboard.writeText(payload);
			toast.success(`已复制最近 ${latestFailureDiagnostics.length} 条失败诊断串`);
		} catch {
			toast.error("复制失败，请手动复制");
		}
	}, [latestFailureDiagnostics]);

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" onClick={() => void loadItems()} disabled={loading}>
					刷新
				</Button>
				<Button variant="outline" size="sm" onClick={() => void checkTriggers()}>
					手动触发检查
				</Button>
				<Link href={buildFailureListHref("/watchlist")}>
					<Button variant="outline" size="sm">
						失败快速视图
					</Button>
				</Link>
				<Link href={tradeReturnHref} className="text-sm text-cyan-300 underline underline-offset-4">
					返回交易页
				</Link>
				{checkResult ? (
					<span className="text-xs text-muted-foreground">
						本次检查 {checkResult.checked} 条，触发 {checkResult.triggered} 条
					</span>
				) : null}
			</div>

			<div className="rounded-xl border border-cyan-500/20 bg-card/70 p-4">
				<h2 className="mb-3 text-sm font-semibold">新增监控</h2>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
					<input
						className="h-9 rounded-md border border-border bg-background px-3 text-sm"
						value={symbol}
						onChange={(e) => setSymbol(e.target.value)}
						placeholder="例如 600000.SH"
					/>
					<select
						className="h-9 rounded-md border border-border bg-background px-3 text-sm"
						value={alertType}
						onChange={(e) => setAlertType(e.target.value as AlertType)}
					>
						<option value="price_above">价格上破</option>
						<option value="price_below">价格下破</option>
						<option value="percent_up">涨幅到达</option>
						<option value="percent_down">跌幅到达</option>
					</select>
					<input
						className="h-9 rounded-md border border-border bg-background px-3 text-sm"
						value={alertPrice}
						onChange={(e) => setAlertPrice(e.target.value)}
						placeholder="阈值"
						inputMode="decimal"
					/>
					<Button onClick={() => void createItem()}>新增</Button>
				</div>
				{message ? <p className="mt-2 text-xs text-red-300">{message}</p> : null}
			</div>

			<div className="rounded-xl border border-cyan-500/20 bg-card/70 p-4">
				<div className="mb-2 flex items-center justify-between">
					<h2 className="text-sm font-semibold">监控列表</h2>
					<span className="text-xs text-muted-foreground">
						待触发 {pendingCount} 条 / 已触发 {triggeredCount} 条
					</span>
				</div>
				<div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
					<Link href="/watchlist?view=all" className="text-cyan-300 underline underline-offset-4">
						全部
					</Link>
					<Link href="/watchlist?view=pending" className="text-cyan-300 underline underline-offset-4">
						仅待触发
					</Link>
					<Link href="/watchlist?view=triggered" className="text-cyan-300 underline underline-offset-4">
						仅已触发
					</Link>
					<Link href={buildFailureListHref("/watchlist")} className="text-cyan-300 underline underline-offset-4">
						失败关联
					</Link>
					{symbolFilter ? <span className="text-muted-foreground">代码过滤：{symbolFilter}</span> : null}
				</div>
				<div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
					<span className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
						当前视图：{VIEW_LABEL[viewFilter] ?? VIEW_LABEL.all}
					</span>
					{symbolFilter ? (
						<span className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
							代码：{symbolFilter}
						</span>
					) : null}
				</div>
				{riskFailures.length > 0 ? (
					<div className="mb-2 rounded-md border border-red-300/40 bg-red-500/5 p-2 text-xs">
						<div className="mb-1 flex items-center justify-between gap-2">
							<p className="font-medium text-red-300">最近失败摘要（风控联动）</p>
							<Button
								variant="outline"
								size="sm"
								className="h-6 px-2 text-[11px]"
								onClick={() => void copyLatestFailureDiagnostics()}
							>
								复制最近3条诊断串
							</Button>
						</div>
						<div className="space-y-1">
							{prioritizedRiskFailures.slice(0, 3).map((item) => {
								const symbol = resolveFailureSymbol(item);
								const score = resolveFailurePriority(item);
								const href = buildFailureListHref("/watchlist", symbol);
								const resultView = buildExecutionResultView({
									status: "rejected",
									serverMessage: item.content,
									executionTier: item.meta?.executionTier,
									liquidityScore: item.meta?.liquidityScore,
								});
								return (
									<div key={item.id} className="rounded border border-red-400/30 p-1">
										<Link href={href} className="block text-red-200 underline underline-offset-4">
											[{item.code ?? "RISK"}] {resultView.statusText}
										</Link>
										<div className="mt-1">
											<Badge variant={resultView.badgeVariant}>{resultView.statusText}</Badge>
										</div>
										<p className="mt-1 text-[11px] text-amber-300">
											风险优先级：{formatFailurePriorityTagByScore(score)}（score={score}）
										</p>
										<p className="mt-1 text-[11px] text-red-100/90">{resultView.detailText}</p>
										<p className="mt-1 break-all text-[11px] text-red-100/90">{formatRiskDiagnostic(item)}</p>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
				<div className="overflow-x-auto">
					<table className="w-full min-w-[760px] text-left text-xs">
						<thead>
							<tr className="border-b border-border/80 text-muted-foreground">
								<th className="px-2 py-2">代码</th>
								<th className="px-2 py-2">类型</th>
								<th className="px-2 py-2">阈值</th>
								<th className="px-2 py-2">状态</th>
								<th className="px-2 py-2">创建时间</th>
								<th className="px-2 py-2">操作</th>
							</tr>
						</thead>
						<tbody>
							{filteredItems.map((item) => (
								<tr key={item.id} className="border-b border-border/40">
									<td className="px-2 py-2">{item.symbol}</td>
									<td className="px-2 py-2">{ALERT_LABEL[item.alert_type] ?? item.alert_type}</td>
									<td className="px-2 py-2">{Number(item.alert_price).toFixed(3)}</td>
									<td className="px-2 py-2">
										<span
											className={
												failedSymbols.has(item.symbol.toUpperCase())
													? "text-red-300"
													: item.triggered
													? "text-emerald-300"
													: "text-amber-300"
											}
										>
											{item.triggered ? "已触发" : "监控中"}
											{failedSymbols.has(item.symbol.toUpperCase()) ? " / 存在失败关联" : ""}
										</span>
									</td>
									<td className="px-2 py-2">{new Date(item.created_at).toLocaleString()}</td>
									<td className="px-2 py-2">
										<Button variant="ghost" size="sm" onClick={() => void deleteItem(item.id)}>
											删除
										</Button>
									</td>
								</tr>
							))}
							{filteredItems.length === 0 ? (
								<tr>
									<td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
										当前筛选下暂无监控项
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
