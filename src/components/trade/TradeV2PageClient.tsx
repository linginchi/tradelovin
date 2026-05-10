"use client";

import { ArrowLeft, RefreshCcw, Signal, SignalHigh } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
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
import {
	buildExecutionResultView,
} from "@/lib/trade-v2/execution-copy";
import { buildFailureListHref, isFailedEventView } from "@/lib/trade-v2/failure-query";
import type {
	RiskMessagesApiResponse,
	TradeV2AccountApiResponse,
	TradeV2AccountSummary,
	TradeV2ConditionItem,
	TradeV2ConditionsApiResponse,
	TradeV2OrderApiResponse,
	TradeV2CancelApiResponse,
	TradeV2OrderListItem,
	TradeV2OrdersApiResponse,
	TradeV2QuoteApiResponse,
	TradeV2QuoteData,
	TradeV2PersonalResourceItem,
	TradeV2PersonalResourcesApiResponse,
	TradeV2PositionListItem,
	TradeV2PositionsApiResponse,
	TradeV2PublicResourcesApiResponse,
	TradeV2PublicResourceItem,
	TradeV2ResourceMutationApiResponse,
	TradeV2RiskMessagesReadApiResponse,
	TradeV2SettingsApiResponse,
	TradeV2TradeListItem,
	TradeV2TradesApiResponse,
	TradeV2WatchlistApiResponse,
	TradeV2WatchlistItem,
	TradeV2ForceCloseApiResponse,
} from "@/lib/trade-v2/api-types";
import type { RiskFailureMeta, RiskMessageRow } from "@/lib/trade-v2/failure-types";

type AccountResp = TradeV2AccountSummary;

type OrderRow = TradeV2OrderListItem;
type TradeRow = TradeV2TradeListItem;
type PositionRow = TradeV2PositionListItem;

type PublicResourceRow = TradeV2PublicResourceItem;
type PersonalResourceRow = TradeV2PersonalResourceItem;
type WatchlistRow = TradeV2WatchlistItem;
type ConditionRow = TradeV2ConditionItem;

type TriggerEvent = {
	id: string;
	kind: "watchlist" | "condition" | "risk_failure";
	symbol: string;
	title: string;
	detail: string;
	sourceTag: string;
	href: string;
	altHref?: string;
	time: string;
	meta?: RiskFailureMeta;
};

function fmtMoney(n: number) {
	const v = Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;
	return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function hkTime(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		timeZone: "Asia/Hong_Kong",
		hour12: false,
	});
}

function getShanghaiDateParts(now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	})
		.formatToParts(now)
		.reduce<Record<string, string>>((acc, p) => {
			if (p.type !== "literal") acc[p.type] = p.value;
			return acc;
		}, {});
	return {
		year: parts.year,
		month: parts.month,
		day: parts.day,
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second),
	};
}

function msToForceClose(now = new Date()): number {
	const p = getShanghaiDateParts(now);
	const target = new Date(`${p.year}-${p.month}-${p.day}T14:59:00+08:00`).getTime();
	const current = now.getTime();
	return target - current;
}

async function parseJson<T>(res: Response): Promise<T> {
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new Error("NETWORK_JSON");
	}
	return body as T;
}

function extractCodeFromDetail(detail: string): string {
	const matched = detail.match(/^\[([^\]]+)\]/)?.[1] ?? "";
	return matched || "RISK";
}

function formatRiskDiagnostic(event: TriggerEvent): string {
	return formatFailureDiagnostic(
		{
			code: extractCodeFromDetail(event.detail),
			content: event.detail,
			createdAt: event.time,
			meta: {
				symbol: event.symbol,
				...event.meta,
			},
		},
		{ timeFormatter: hkTime },
	);
}

function resolveEventFailureScore(event: TriggerEvent): number {
	return resolveFailurePriority({
		code: extractCodeFromDetail(event.detail),
		meta: event.meta,
	});
}

export function TradeV2PageClient() {
	const locale = useLocale();
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const querySymbolCandidate = normalizeCnSymbol(searchParams.get("symbol") ?? "");
	const querySymbol = isCanonicalCnSymbol(querySymbolCandidate) ? querySymbolCandidate : "";
	const defaultSymbol = querySymbol || "600519.SH";
	const [symbolInput, setSymbolInput] = useState(defaultSymbol);
	const [resolvedSymbol, setResolvedSymbol] = useState(defaultSymbol);
	const [quote, setQuote] = useState<TradeV2QuoteData | null>(null);
	const [account, setAccount] = useState<AccountResp | null>(null);
	const [orders, setOrders] = useState<OrderRow[]>([]);
	const [trades, setTrades] = useState<TradeRow[]>([]);
	const [positions, setPositions] = useState<PositionRow[]>([]);
	const [publicResources, setPublicResources] = useState<PublicResourceRow[]>([]);
	const [personalResources, setPersonalResources] = useState<PersonalResourceRow[]>([]);
	const [riskMessages, setRiskMessages] = useState<RiskMessageRow[]>([]);
	const [watchlistItems, setWatchlistItems] = useState<WatchlistRow[]>([]);
	const [conditionItems, setConditionItems] = useState<ConditionRow[]>([]);
	const [fetchError, setFetchError] = useState("");
	const [qty, setQty] = useState("100");
	const [price, setPrice] = useState("");
	const [sourceMode, setSourceMode] = useState<"normal" | "fast">("normal");
	const [accountType, setAccountType] = useState<"normal" | "credit">("normal");
	const [positionMode, setPositionMode] = useState<"long" | "short">("long");
	const [placing, setPlacing] = useState(false);
	const [bootLoading, setBootLoading] = useState(true);
	const [resourceLoading, setResourceLoading] = useState(false);
	const [nowTick, setNowTick] = useState(0);
	const [autoLogoutNight, setAutoLogoutNight] = useState(false);
	const failureOnlyEvents = isFailedEventView(searchParams.get("eventView"));

	const loadQuote = useCallback(
		async (symbol: string) => {
			const clean = symbol.trim().toUpperCase();
			if (!clean) return;
			setFetchError("");
			try {
				const res = await fetch(
					`/api/market/quote?symbol=${encodeURIComponent(clean)}&locale=${encodeURIComponent(locale)}&mode=${sourceMode}`,
					{ credentials: "include" }
				);
				const json = await parseJson<TradeV2QuoteApiResponse>(res);
				if (!json.success || !json.data) {
					throw new Error(json.error ?? "行情暂不可用");
				}
				setQuote(json.data);
				if (!price) setPrice(String(json.data.price));
			} catch (error) {
				setFetchError(error instanceof Error ? error.message : "行情加载失败");
			}
		},
		[locale, price, sourceMode]
	);

	const loadTradeData = useCallback(async () => {
		const [accountRes, ordersRes, tradesRes, positionsRes] = await Promise.all([
			fetch(`/api/trade-v2/account?accountType=${accountType}`, { credentials: "include" }),
			fetch(`/api/trade-v2/orders?accountType=${accountType}`, { credentials: "include" }),
			fetch(`/api/trade-v2/trades?accountType=${accountType}`, { credentials: "include" }),
			fetch(`/api/trade-v2/positions?accountType=${accountType}`, { credentials: "include" }),
		]);
		const [accountJson, ordersJson, tradesJson, positionsJson] = await Promise.all([
			parseJson<TradeV2AccountApiResponse>(accountRes),
			parseJson<TradeV2OrdersApiResponse>(ordersRes),
			parseJson<TradeV2TradesApiResponse>(tradesRes),
			parseJson<TradeV2PositionsApiResponse>(positionsRes),
		]);

		if (!accountJson.success || !accountJson.data) throw new Error(accountJson.error ?? "账户读取失败");
		if (!ordersJson.success || ordersJson.data === undefined) throw new Error(ordersJson.error ?? "委托读取失败");
		if (!tradesJson.success || tradesJson.data === undefined) throw new Error(tradesJson.error ?? "成交读取失败");
		if (!positionsJson.success || positionsJson.data === undefined) throw new Error(positionsJson.error ?? "仓位读取失败");

		setAccount(accountJson.data);
		setOrders(ordersJson.data);
		setTrades(tradesJson.data);
		setPositions(positionsJson.data);
	}, [accountType]);

	const loadResources = useCallback(async () => {
		setResourceLoading(true);
		try {
			const [publicRes, personalRes] = await Promise.all([
				fetch("/api/resources/public", { credentials: "include" }),
				fetch("/api/resources/personal", { credentials: "include" }),
			]);
			const [publicJson, personalJson] = await Promise.all([
				parseJson<TradeV2PublicResourcesApiResponse>(publicRes),
				parseJson<TradeV2PersonalResourcesApiResponse>(personalRes),
			]);
			if (!publicJson.success || publicJson.data === undefined) {
				throw new Error(publicJson.error ?? "公共资源读取失败");
			}
			if (!personalJson.success || personalJson.data === undefined) {
				throw new Error(personalJson.error ?? "个人资源读取失败");
			}
			setPublicResources(publicJson.data);
			setPersonalResources(personalJson.data);
		} finally {
			setResourceLoading(false);
		}
	}, []);

	const loadRiskMessages = useCallback(async () => {
		const res = await fetch("/api/risk/messages?unreadOnly=1", { credentials: "include" });
		const json = await parseJson<RiskMessagesApiResponse>(res);
		if (!json.success || json.data === undefined) {
			throw new Error(json.error ?? "读取风控消息失败");
		}
		setRiskMessages(json.data);
	}, []);

	const loadMonitorHub = useCallback(async () => {
		const [watchRes, conditionRes] = await Promise.all([
			fetch("/api/watchlist", { credentials: "include" }),
			fetch("/api/conditions", { credentials: "include" }),
		]);
		const [watchJson, conditionJson] = await Promise.all([
			parseJson<TradeV2WatchlistApiResponse>(watchRes),
			parseJson<TradeV2ConditionsApiResponse>(conditionRes),
		]);
		if (!watchJson.success || watchJson.data === undefined) {
			throw new Error(watchJson.error ?? "读取监控列表失败");
		}
		if (!conditionJson.success || conditionJson.data === undefined) {
			throw new Error(conditionJson.error ?? "读取条件单列表失败");
		}
		setWatchlistItems(watchJson.data);
		setConditionItems(conditionJson.data);
	}, []);

	const loadSettings = useCallback(async () => {
		const res = await fetch("/api/trade-v2/settings", { credentials: "include" });
		const json = await parseJson<TradeV2SettingsApiResponse>(res);
		if (!json.success || !json.data) {
			throw new Error(json.error ?? "读取设置失败");
		}
		setQty(String(json.data.default_qty));
		setAccountType(json.data.default_account_type);
		setPositionMode(json.data.default_position_mode);
		setSourceMode(json.data.default_source_mode);
		setAutoLogoutNight(json.data.auto_logout_night);
	}, []);

	const loadAll = useCallback(async () => {
		setBootLoading(true);
		try {
			await Promise.all([
				loadSettings(),
				loadTradeData(),
				loadResources(),
				loadRiskMessages(),
				loadMonitorHub(),
				loadQuote(resolvedSymbol),
			]);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "加载失败");
		} finally {
			setBootLoading(false);
		}
	}, [loadMonitorHub, loadQuote, loadResources, loadRiskMessages, loadSettings, loadTradeData, resolvedSymbol]);

	useEffect(() => {
		const init = window.setTimeout(() => {
			void loadAll();
		}, 0);
		return () => window.clearTimeout(init);
	}, [loadAll]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			void loadQuote(resolvedSymbol);
			void loadTradeData();
			void loadResources();
			void loadRiskMessages();
			void loadMonitorHub();
		}, sourceMode === "fast" ? 2000 : 4000);
		return () => {
			window.clearInterval(timer);
		};
	}, [loadMonitorHub, loadQuote, loadResources, loadRiskMessages, loadTradeData, resolvedSymbol, sourceMode]);

	useEffect(() => {
		const t = window.setInterval(() => setNowTick(Date.now()), 1000);
		return () => window.clearInterval(t);
	}, []);
	useEffect(() => {
		if (!querySymbol) return;
		if (querySymbol === resolvedSymbol && querySymbol === symbolInput) return;
		const timer = window.setTimeout(() => {
			setResolvedSymbol(querySymbol);
			setSymbolInput(querySymbol);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [querySymbol, resolvedSymbol, symbolInput]);

	const marketSourceLabel = useMemo(() => {
		if (!quote) return "—";
		return quote.source === "sina" ? "L1-Fallback" : "L1-Tushare";
	}, [quote]);

	const watchPendingCount = useMemo(
		() => watchlistItems.filter((item) => !item.triggered).length,
		[watchlistItems],
	);
	const watchTriggeredCount = useMemo(
		() => watchlistItems.filter((item) => item.triggered).length,
		[watchlistItems],
	);
	const conditionActiveCount = useMemo(
		() => conditionItems.filter((item) => item.status === "active").length,
		[conditionItems],
	);
	const conditionTriggeredCount = useMemo(
		() => conditionItems.filter((item) => item.status === "triggered").length,
		[conditionItems],
	);
	const recentTriggerEvents = useMemo<TriggerEvent[]>(() => {
		const watchEvents: TriggerEvent[] = watchlistItems
			.filter((item) => item.triggered)
			.map((item) => ({
				id: `watch-${item.id}`,
				kind: "watchlist",
				symbol: item.symbol,
				title: "监控触发",
				detail: `${item.alert_type} @ ${fmtMoney(Number(item.alert_price))}`,
				sourceTag: "watchlist/check（手动或轮询）",
				href: `/watchlist?view=triggered&symbol=${encodeURIComponent(item.symbol)}`,
				time: item.updated_at ?? item.created_at,
			}));
		const conditionEvents: TriggerEvent[] = conditionItems
			.filter((item) => item.status === "triggered")
			.map((item) => ({
				id: `condition-${item.id}`,
				kind: "condition",
				symbol: item.symbol,
				title: "条件单触发",
				detail: `${item.condition_type} ${fmtMoney(Number(item.condition_price))} -> ${item.order_side} ${fmtMoney(Number(item.order_price))} x ${item.order_quantity}`,
				sourceTag: "conditions/trigger（手动或轮询）",
				href: `/conditions?view=triggered&symbol=${encodeURIComponent(item.symbol)}`,
				time: item.updated_at ?? item.created_at,
			}));
		const riskFailureEvents: TriggerEvent[] = riskMessages
			.filter((msg) => msg.code === "ORDER_REJECTED" || msg.code === "BROKER_SIM_DROP")
			.map((msg) => {
				const symbol = resolveFailureSymbol({ content: msg.content, meta: msg.meta });
				const execInfo = [
					msg.meta?.executionTier ? `tier=${msg.meta.executionTier}` : "",
					typeof msg.meta?.liquidityScore === "number" ? `liq=${msg.meta.liquidityScore.toFixed(2)}` : "",
					typeof msg.meta?.priceGapBps === "number" ? `gapBps=${msg.meta.priceGapBps}` : "",
				]
					.filter(Boolean)
					.join(" | ");
				return {
					id: `risk-${msg.id}`,
					kind: "risk_failure" as const,
					symbol: symbol || "UNKNOWN",
					title: "触发失败",
					detail: `[${msg.code ?? "RISK"}] ${msg.content}${execInfo ? ` | ${execInfo}` : ""}`,
					sourceTag: "risk/messages（风控失败联动）",
					href: buildFailureListHref("/conditions", symbol),
					altHref: buildFailureListHref("/watchlist", symbol),
					time: msg.created_at,
					meta: msg.meta,
				};
			});
		return [...watchEvents, ...conditionEvents, ...riskFailureEvents]
			.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
			.slice(0, 8);
	}, [conditionItems, riskMessages, watchlistItems]);
	const failureContextSymbol = useMemo(() => {
		if (querySymbol) return querySymbol;
		const fromRisk = recentTriggerEvents.find(
			(e) => e.kind === "risk_failure" && e.symbol && e.symbol !== "UNKNOWN",
		)?.symbol;
		return fromRisk ?? resolvedSymbol;
	}, [querySymbol, recentTriggerEvents, resolvedSymbol]);
	const watchlistHref = useMemo(() => {
		if (!failureOnlyEvents) return "/watchlist";
		return buildFailureListHref("/watchlist", failureContextSymbol);
	}, [failureContextSymbol, failureOnlyEvents]);
	const conditionsHref = useMemo(() => {
		if (!failureOnlyEvents) return "/conditions";
		return buildFailureListHref("/conditions", failureContextSymbol);
	}, [failureContextSymbol, failureOnlyEvents]);
	const displayTriggerEvents = useMemo(
		() => {
			if (!failureOnlyEvents) return recentTriggerEvents;
			return recentTriggerEvents
				.filter((event) => event.kind === "risk_failure")
				.sort((a, b) => {
					const scoreDiff = resolveEventFailureScore(b) - resolveEventFailureScore(a);
					if (scoreDiff !== 0) return scoreDiff;
					return new Date(b.time).getTime() - new Date(a.time).getTime();
				});
		},
		[failureOnlyEvents, recentTriggerEvents],
	);
	const updateSymbolInQuery = useCallback(
		(symbol: string) => {
			const current = new URLSearchParams(searchParams.toString());
			const normalized = normalizeCnSymbol(symbol);
			if (normalized) {
				current.set("symbol", normalized);
			} else {
				current.delete("symbol");
			}
			const query = current.toString();
			router.replace(query ? (`${pathname}?${query}` as never) : (pathname as never));
		},
		[pathname, router, searchParams],
	);
	const toggleFailureEventView = useCallback(() => {
		const current = new URLSearchParams(searchParams.toString());
		if (failureOnlyEvents) {
			current.delete("eventView");
		} else {
			current.set("eventView", "failed");
		}
		const query = current.toString();
		router.replace(query ? (`${pathname}?${query}` as never) : (pathname as never));
	}, [failureOnlyEvents, pathname, router, searchParams]);

	const handlePlaceOrder = useCallback(
		async (side: "buy" | "sell") => {
			const px = Number(price);
			const q = Number(qty);
			if (!Number.isFinite(px) || px <= 0) {
				toast.error("价格必须大于 0");
				return;
			}
			if (!Number.isInteger(q) || q <= 0) {
				toast.error("股数必须为正整数");
				return;
			}
			setPlacing(true);
			try {
				const res = await fetch("/api/trade-v2/order", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						symbol: resolvedSymbol,
						side,
						price: px,
						quantity: q,
						accountType,
						positionMode,
					}),
				});
				const json = await parseJson<TradeV2OrderApiResponse>(res);
				if (!json.success) {
					toast.error(json.error ?? "下单失败");
					return;
				}
				const status = json.data?.status ?? "filled";
				const resultView = buildExecutionResultView({
					side,
					positionMode,
					status,
					serverMessage: json.data?.message,
					executionTier: json.data?.execution_tier,
					liquidityScore: json.data?.liquidity_score,
				});
				if (resultView.tone === "success") {
					toast.success(resultView.toastText);
				} else {
					toast.warning(resultView.toastText);
				}
				if (json.data?.exec_price) setPrice(String(json.data.exec_price));
				await loadTradeData();
				await loadResources();
				await loadQuote(resolvedSymbol);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "下单失败");
			} finally {
				setPlacing(false);
			}
		},
		[accountType, loadQuote, loadResources, loadTradeData, positionMode, price, qty, resolvedSymbol]
	);

	const cancelOrder = useCallback(
		async (orderId: string) => {
			try {
				const res = await fetch("/api/trade-v2/cancel", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ orderId, accountType }),
				});
				const json = await parseJson<TradeV2CancelApiResponse>(res);
				if (!json.success) {
					toast.error(json.error ?? "撤单失败");
					return;
				}
				toast.success("撤单成功");
				await loadTradeData();
				await loadResources();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "撤单失败");
			}
		},
		[accountType, loadResources, loadTradeData]
	);

	const applyResource = useCallback(async (side: "long" | "short") => {
		const quantity = Number(qty);
		if (!Number.isInteger(quantity) || quantity <= 0) {
			toast.error("申请数量必须为正整数");
			return;
		}
		try {
			const res = await fetch("/api/resources/apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					symbol: resolvedSymbol,
					side,
					quantity,
				}),
			});
			const json = await parseJson<TradeV2ResourceMutationApiResponse>(res);
			if (!json.success) {
				toast.error(json.error ?? "申请资源失败");
				return;
			}
			toast.success(`${side === "long" ? "多头" : "空头"}资源申请成功`);
			await loadResources();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "申请资源失败");
		}
	}, [loadResources, qty, resolvedSymbol]);

	const returnResourceBack = useCallback(async (side: "long" | "short") => {
		const quantity = Number(qty);
		if (!Number.isInteger(quantity) || quantity <= 0) {
			toast.error("退回数量必须为正整数");
			return;
		}
		try {
			const res = await fetch("/api/resources/return", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					symbol: resolvedSymbol,
					side,
					quantity,
				}),
			});
			const json = await parseJson<TradeV2ResourceMutationApiResponse>(res);
			if (!json.success) {
				toast.error(json.error ?? "退回资源失败");
				return;
			}
			toast.success(`${side === "long" ? "多头" : "空头"}资源退回成功`);
			await loadResources();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "退回资源失败");
		}
	}, [loadResources, qty, resolvedSymbol]);

	const forceCloseNow = useCallback(async () => {
		try {
			const res = await fetch("/api/trade-v2/force-close", {
				method: "POST",
				credentials: "include",
			});
			const json = await parseJson<TradeV2ForceCloseApiResponse>(res);
			if (!json.success) {
				toast.error(json.error ?? "强平失败");
				return;
			}
			toast.success(
				`强平完成：总 ${json.data?.total ?? 0}，成功 ${json.data?.success ?? 0}，失败 ${json.data?.failed ?? 0}`,
			);
			await loadAll();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "强平失败");
		}
	}, [loadAll]);

	const markRiskReadAll = useCallback(async () => {
		try {
			const res = await fetch("/api/risk/messages/read", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ all: true }),
			});
			const json = await parseJson<TradeV2RiskMessagesReadApiResponse>(res);
			if (!json.success) {
				toast.error(json.error ?? "标记已读失败");
				return;
			}
			await loadRiskMessages();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "标记已读失败");
		}
	}, [loadRiskMessages]);

	const saveSettings = useCallback(async () => {
		const defaultQty = Number(qty);
		if (!Number.isInteger(defaultQty) || defaultQty <= 0) {
			toast.error("默认股数必须为正整数");
			return;
		}
		try {
			const res = await fetch("/api/trade-v2/settings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					defaultQty,
					defaultAccountType: accountType,
					defaultPositionMode: positionMode,
					defaultSourceMode: sourceMode,
					autoLogoutNight,
				}),
			});
			const json = await parseJson<TradeV2SettingsApiResponse>(res);
			if (!json.success) {
				toast.error(json.error ?? "保存设置失败");
				return;
			}
			toast.success("设置已保存");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存设置失败");
		}
	}, [accountType, autoLogoutNight, positionMode, qty, sourceMode]);

	const copyFailureDetail = useCallback(async (event: TriggerEvent) => {
		const diagnostic = formatRiskDiagnostic(event);
		try {
			await navigator.clipboard.writeText(diagnostic);
			toast.success("结构化诊断串已复制");
		} catch {
			toast.error("复制失败，请手动复制");
		}
	}, []);

	const closeCountdownMs = msToForceClose(new Date(nowTick));
	const forceCloseHint =
		nowTick === 0
			? "强平时钟同步中..."
			: closeCountdownMs <= 0
			? "已到强平时间窗口"
			: `距14:59自动平仓还有 ${Math.floor(closeCountdownMs / 60000)}分${Math.floor(
					(closeCountdownMs % 60000) / 1000,
				)}秒`;
	const workbenchPanels = [
		{ id: "panel-market-select", label: "行情选择" },
		{ id: "panel-market", label: "行情" },
		{ id: "panel-order", label: "下单" },
		{ id: "panel-orders", label: "委托" },
		{ id: "panel-positions", label: "仓位" },
		{ id: "panel-resources", label: "资源" },
		{ id: "panel-settings", label: "设置" },
		{ id: "panel-account", label: "账户" },
		{ id: "panel-monitor", label: "监控" },
	] as const;
	const jumpToPanel = (panelId: (typeof workbenchPanels)[number]["id"]) => {
		const el = document.getElementById(panelId);
		el?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-24">
			<Toaster richColors />
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Link href="/trade-legacy">
						<Button variant="ghost" size="icon" aria-label="返回旧版交易">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<p className="text-sm font-semibold">T+0 模拟交易 V2（P1）</p>
						<p className="text-muted-foreground text-xs">已接入下单/委托/成交/仓位真实数据链路</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link href={watchlistHref}>
						<Button variant="outline" size="sm">
							监控
						</Button>
					</Link>
					<Link href={conditionsHref}>
						<Button variant="outline" size="sm">
							条件单
						</Button>
					</Link>
					<Badge variant="secondary">Beta</Badge>
				</div>
			</div>

			<Card className="sticky top-2 z-10">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Level2 工作台导航</CardTitle>
					<CardDescription>移动端竖版可快速跳转到核心操作区</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto pb-4">
					<div className="flex min-w-max items-center gap-2">
						{workbenchPanels.map((panel) => (
							<Button
								key={panel.id}
								type="button"
								variant="outline"
								size="sm"
								onClick={() => jumpToPanel(panel.id)}
							>
								{panel.label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			<Card id="panel-monitor">
				<CardHeader className="pb-3">
					<CardTitle className="text-base">监控与条件单总览</CardTitle>
					<CardDescription>主面板实时查看待触发/已触发与活跃状态</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs">监控待触发</p>
						<p className="mt-1 text-xl font-semibold">{watchPendingCount}</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs">监控已触发</p>
						<p className="mt-1 text-xl font-semibold">{watchTriggeredCount}</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs">条件单活跃</p>
						<p className="mt-1 text-xl font-semibold">{conditionActiveCount}</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs">条件单已触发</p>
						<p className="mt-1 text-xl font-semibold">{conditionTriggeredCount}</p>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between gap-2">
						<div>
							<CardTitle className="text-base">最近触发事件流</CardTitle>
							<CardDescription>展示监控与条件单最近触发记录</CardDescription>
						</div>
						<Button
							variant={failureOnlyEvents ? "default" : "outline"}
							size="sm"
							onClick={() => toggleFailureEventView()}
						>
							{failureOnlyEvents ? "显示全部事件" : "仅看失败事件"}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="flex items-center gap-2 text-xs">
						<span className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
							当前模式：{failureOnlyEvents ? "失败事件" : "全部事件"}
						</span>
						{failureOnlyEvents ? (
							<span className="text-muted-foreground">URL 已包含 `eventView=failed`，可直接分享复现</span>
						) : null}
					</div>
					{displayTriggerEvents.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{failureOnlyEvents ? "暂无失败事件" : "暂无触发事件"}
						</p>
					) : (
						displayTriggerEvents.map((event) => (
							<div key={event.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
								<div className="min-w-0">
									<p className="font-medium">
										[
										{event.kind === "watchlist"
											? "监控"
											: event.kind === "condition"
											? "条件单"
											: "失败"}
										]{" "}
										{event.symbol} - {event.title}
									</p>
									<p className="truncate text-muted-foreground">{event.detail}</p>
									<p className="truncate text-muted-foreground">触发链路：{event.sourceTag}</p>
								</div>
								<div className="pl-3 text-right">
									<p className="text-muted-foreground">{hkTime(event.time)}</p>
									<Link href={event.href} className="text-cyan-300 underline underline-offset-4">
										查看详情
									</Link>
									{event.kind === "risk_failure" && event.altHref ? (
										<div>
											<Link href={event.altHref} className="text-cyan-300 underline underline-offset-4">
												查看监控侧
											</Link>
										</div>
									) : null}
									{event.kind === "risk_failure" ? (
										<div>
											<p className="mt-1 text-[11px] text-amber-300">
												风险优先级：{formatFailurePriorityTagByScore(resolveEventFailureScore(event))}（score=
												{resolveEventFailureScore(event)}）
											</p>
											<details className="mt-1 max-w-[28rem] rounded border border-border/60 px-1 py-0.5 text-left">
												<summary className="cursor-pointer text-[11px] text-muted-foreground">
													查看诊断串
												</summary>
												<p className="mt-1 break-all text-[11px] text-muted-foreground">
													{formatRiskDiagnostic(event)}
												</p>
											</details>
											<Button
												variant="outline"
												size="sm"
												className="mt-1 h-6 px-2 text-[11px]"
												onClick={() => void copyFailureDetail(event)}
											>
												复制诊断串
											</Button>
										</div>
									) : null}
								</div>
							</div>
						))
					)}
				</CardContent>
			</Card>

			<Card id="panel-market-select">
				<CardHeader className="pb-3">
					<CardTitle className="text-base">交易抬头</CardTitle>
					<CardDescription>产品账户、行情源、标的选择</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1.5">
						<Label htmlFor="accountSwitch">账户类型</Label>
						<select
							id="accountSwitch"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={accountType}
							onChange={(e) => setAccountType(e.target.value === "credit" ? "credit" : "normal")}
						>
							<option value="normal">普通账户</option>
							<option value="credit">信用账户</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sourceMode">行情源</Label>
						<select
							id="sourceMode"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={sourceMode}
							onChange={(e) => setSourceMode(e.target.value === "fast" ? "fast" : "normal")}
						>
							<option value="normal">普通（4秒）</option>
							<option value="fast">极速（2秒）</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="symbolInput">标的代码</Label>
						<Input id="symbolInput" value={symbolInput} onChange={(e) => setSymbolInput(e.target.value)} />
					</div>
					<div className="flex items-end gap-2">
						<Button
							className="flex-1"
							onClick={() => {
								const clean = normalizeCnSymbol(symbolInput);
								if (!isCanonicalCnSymbol(clean)) {
									toast.error(SYMBOL_INPUT_HINT_MESSAGE);
									return;
								}
								setResolvedSymbol(clean);
								setSymbolInput(clean);
								void loadQuote(clean);
								updateSymbolInQuery(clean);
							}}
						>
							切换标的
						</Button>
						<Button variant="outline" size="icon" onClick={() => void loadAll()}>
							<RefreshCcw className="h-4 w-4" />
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 lg:grid-cols-12">
				<Card id="panel-market" className="lg:col-span-8">
					<CardHeader className="pb-3">
						<CardTitle className="text-base">行情与盘口</CardTitle>
						<CardDescription className="flex items-center gap-2">
							{sourceMode === "fast" ? <SignalHigh className="h-3.5 w-3.5" /> : <Signal className="h-3.5 w-3.5" />}
							<span>当前源：{marketSourceLabel}</span>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="rounded-md border p-3">
							<p className="text-sm font-medium">{quote?.symbol ?? resolvedSymbol}</p>
							<p className="text-muted-foreground text-xs">{quote?.name ?? "—"}</p>
							<p className="mt-2 text-2xl font-semibold">{quote ? fmtMoney(quote.price) : "--"}</p>
							<p className="text-muted-foreground text-xs">
								快照时间：{quote?.snapshot_time ? new Date(quote.snapshot_time).toLocaleTimeString() : "—"}
							</p>
						</div>
						{bootLoading ? <p className="text-muted-foreground text-sm">加载中...</p> : null}
						{fetchError ? <p className="text-sm text-red-500">{fetchError}</p> : null}
						<div className="grid grid-cols-2 gap-2">
							<div className="rounded-md border p-3">
								<p className="mb-2 text-xs font-medium">卖盘（点价可手动填入）</p>
								<div className="space-y-1 text-xs">
									{quote?.order_book?.asks?.map((ask) => (
										<button
											key={`ask-${ask.level}`}
											type="button"
											className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-muted"
											onClick={() => setPrice(String(ask.price))}
										>
											<span>卖{ask.level}</span>
											<span>{fmtMoney(ask.price)}</span>
											<span className="text-muted-foreground">{ask.volume}</span>
										</button>
									)) ?? <span className="text-muted-foreground">暂无</span>}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<p className="mb-2 text-xs font-medium">买盘（点价可手动填入）</p>
								<div className="space-y-1 text-xs">
									{quote?.order_book?.bids?.map((bid) => (
										<button
											key={`bid-${bid.level}`}
											type="button"
											className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-muted"
											onClick={() => setPrice(String(bid.price))}
										>
											<span>买{bid.level}</span>
											<span>{fmtMoney(bid.price)}</span>
											<span className="text-muted-foreground">{bid.volume}</span>
										</button>
									)) ?? <span className="text-muted-foreground">暂无</span>}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card id="panel-order" className="lg:col-span-4">
					<CardHeader className="pb-3">
						<CardTitle className="text-base">快速下单</CardTitle>
						<CardDescription>对手价可直接点盘口填充</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="positionMode">交易模式</Label>
							<select
								id="positionMode"
								className="bg-background w-full rounded-md border px-3 py-2 text-sm"
								value={positionMode}
								onChange={(e) => setPositionMode(e.target.value === "short" ? "short" : "long")}
							>
								<option value="long">做多（买入开仓/卖出平仓）</option>
								<option value="short">做空（卖出开仓/买入回补）</option>
							</select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="orderPrice">价格</Label>
							<Input id="orderPrice" value={price} onChange={(e) => setPrice(e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="qty">股数</Label>
							<Input id="qty" value={qty} onChange={(e) => setQty(e.target.value)} />
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button disabled={placing} onClick={() => void handlePlaceOrder("buy")}>
								{positionMode === "short" ? "买入回补" : "买入"}
							</Button>
							<Button disabled={placing} variant="destructive" onClick={() => void handlePlaceOrder("sell")}>
								{positionMode === "short" ? "卖出开空" : "卖出"}
							</Button>
						</div>
						<div id="panel-account" className="rounded-md border p-2 text-xs">
							<p>账户：{account?.account_name ?? "—"}</p>
							<p>可用：{account ? fmtMoney(account.available_balance) : "—"}</p>
							<p>总资产：{account ? fmtMoney(account.total_assets) : "—"}</p>
						</div>
						<div id="risk-panel" className="space-y-2 rounded-md border p-2 text-xs">
							<p className={closeCountdownMs <= 30 * 60 * 1000 ? "text-amber-600" : "text-muted-foreground"}>
								{forceCloseHint}
							</p>
							<Button variant="outline" size="sm" onClick={() => void forceCloseNow()}>
								测试触发强平
							</Button>
						</div>
						<div className="space-y-2 rounded-md border p-2 text-xs">
							<div className="flex items-center justify-between">
								<p>风控消息（未读）: {riskMessages.length}</p>
								<Button size="sm" variant="outline" onClick={() => void markRiskReadAll()}>
									全部已读
								</Button>
							</div>
							<div className="space-y-1">
								{riskMessages.slice(0, 3).map((msg) => (
									<p key={msg.id} className={msg.level === "error" ? "text-red-600" : "text-muted-foreground"}>
										[{msg.title}] {msg.content}
									</p>
								))}
								{riskMessages.length === 0 ? <p className="text-muted-foreground">暂无未读风控消息</p> : null}
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<Tabs defaultValue="orders" className="w-full">
				<TabsList className="grid w-full grid-cols-5">
					<TabsTrigger value="orders">委托</TabsTrigger>
					<TabsTrigger value="positions">仓位</TabsTrigger>
					<TabsTrigger value="trades">成交</TabsTrigger>
					<TabsTrigger value="resources">资源</TabsTrigger>
					<TabsTrigger value="settings">设置</TabsTrigger>
				</TabsList>
				<TabsContent id="panel-orders" value="orders" className="rounded-md border p-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>时间</TableHead>
								<TableHead>标的</TableHead>
								<TableHead>方向</TableHead>
								<TableHead className="text-end">价格</TableHead>
								<TableHead className="text-end">委托</TableHead>
								<TableHead className="text-end">已成</TableHead>
								<TableHead className="text-end">剩余</TableHead>
								<TableHead className="text-end">状态</TableHead>
								<TableHead>解释</TableHead>
								<TableHead className="text-end">操作</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{orders.length === 0 ? (
								<TableRow>
									<TableCell colSpan={10} className="text-center text-muted-foreground">
										暂无委托
									</TableCell>
								</TableRow>
							) : (
								orders.map((o) => (
									<TableRow key={o.id}>
										{(() => {
											const resultView = buildExecutionResultView({
												status: o.status,
												serverMessage: o.reject_reason ?? undefined,
											});
											return (
												<>
										<TableCell>{hkTime(o.created_at)}</TableCell>
										<TableCell>{o.symbol}</TableCell>
										<TableCell>{o.side === "buy" ? "买入" : "卖出"}</TableCell>
										<TableCell className="text-end">{fmtMoney(Number(o.price))}</TableCell>
										<TableCell className="text-end">{o.quantity}</TableCell>
										<TableCell className="text-end">{o.filled_qty}</TableCell>
										<TableCell className="text-end">{Math.max(0, Number(o.quantity) - Number(o.filled_qty))}</TableCell>
										<TableCell className="text-end">
											<Badge variant={resultView.badgeVariant}>
												{resultView.statusText}
											</Badge>
										</TableCell>
										<TableCell className="max-w-56 truncate text-xs text-muted-foreground">
											{resultView.detailText}
										</TableCell>
										<TableCell className="text-end">
											{o.status === "pending" ? (
												<Button variant="outline" size="sm" onClick={() => void cancelOrder(o.id)}>
													撤单
												</Button>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
												</>
											);
										})()}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TabsContent>
				<TabsContent id="panel-positions" value="positions" className="rounded-md border p-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>标的</TableHead>
								<TableHead>类型</TableHead>
								<TableHead className="text-end">数量</TableHead>
								<TableHead className="text-end">可用</TableHead>
								<TableHead className="text-end">成本</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{positions.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center text-muted-foreground">
										暂无持仓
									</TableCell>
								</TableRow>
							) : (
								positions.map((p) => (
									<TableRow key={p.id}>
										<TableCell>{p.symbol}</TableCell>
										<TableCell>{p.position_type}</TableCell>
										<TableCell className="text-end">{p.quantity}</TableCell>
										<TableCell className="text-end">{p.available_qty}</TableCell>
										<TableCell className="text-end">{fmtMoney(Number(p.cost_price))}</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TabsContent>
				<TabsContent value="trades" className="rounded-md border p-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>时间</TableHead>
								<TableHead>标的</TableHead>
								<TableHead>方向</TableHead>
								<TableHead className="text-end">价格</TableHead>
								<TableHead className="text-end">数量</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{trades.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center text-muted-foreground">
										暂无成交
									</TableCell>
								</TableRow>
							) : (
								trades.map((tr) => (
									<TableRow key={tr.id}>
										<TableCell>{hkTime(tr.trade_time)}</TableCell>
										<TableCell>{tr.symbol}</TableCell>
										<TableCell>{tr.side === "buy" ? "买入" : "卖出"}</TableCell>
										<TableCell className="text-end">{fmtMoney(Number(tr.price))}</TableCell>
										<TableCell className="text-end">{tr.quantity}</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TabsContent>
				<TabsContent id="panel-resources" value="resources" className="space-y-3 rounded-md border p-3">
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="outline" onClick={() => void applyResource("long")}>
							申请多头额度
						</Button>
						<Button variant="outline" onClick={() => void returnResourceBack("long")}>
							退回多头额度
						</Button>
						<Button variant="outline" onClick={() => void applyResource("short")}>
							申请空头额度
						</Button>
						<Button variant="outline" onClick={() => void returnResourceBack("short")}>
							退回空头额度
						</Button>
						{resourceLoading ? <span className="text-muted-foreground text-xs">刷新中...</span> : null}
					</div>
					<div className="grid gap-3 lg:grid-cols-2">
						<div>
							<p className="mb-2 text-sm font-medium">公共资源池</p>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>标的</TableHead>
										<TableHead className="text-end">可做多</TableHead>
										<TableHead className="text-end">可做空</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{publicResources.length === 0 ? (
										<TableRow>
											<TableCell colSpan={3} className="text-center text-muted-foreground">
												暂无公共资源
											</TableCell>
										</TableRow>
									) : (
										publicResources.map((row) => (
											<TableRow key={row.id}>
												<TableCell>{row.symbol}</TableCell>
												<TableCell className="text-end">{row.long_limit}</TableCell>
												<TableCell className="text-end">{row.short_limit}</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
						<div>
							<p className="mb-2 text-sm font-medium">个人资源额度</p>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>标的</TableHead>
										<TableHead className="text-end">多头</TableHead>
										<TableHead className="text-end">空头</TableHead>
										<TableHead className="text-end">动态</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{personalResources.length === 0 ? (
										<TableRow>
											<TableCell colSpan={4} className="text-center text-muted-foreground">
												暂无个人资源
											</TableCell>
										</TableRow>
									) : (
										personalResources.map((row) => (
											<TableRow key={row.id}>
												<TableCell>{row.symbol}</TableCell>
												<TableCell className="text-end">{row.long_quota}</TableCell>
												<TableCell className="text-end">{row.short_quota}</TableCell>
												<TableCell className="text-end">{row.dynamic_quota}</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</div>
				</TabsContent>
				<TabsContent id="panel-settings" value="settings" className="space-y-3 rounded-md border p-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="settingQty">默认股数</Label>
							<Input id="settingQty" value={qty} onChange={(e) => setQty(e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="settingSource">默认行情源</Label>
							<select
								id="settingSource"
								className="bg-background w-full rounded-md border px-3 py-2 text-sm"
								value={sourceMode}
								onChange={(e) => setSourceMode(e.target.value === "fast" ? "fast" : "normal")}
							>
								<option value="normal">普通</option>
								<option value="fast">极速</option>
							</select>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="settingAccount">默认账户</Label>
							<select
								id="settingAccount"
								className="bg-background w-full rounded-md border px-3 py-2 text-sm"
								value={accountType}
								onChange={(e) => setAccountType(e.target.value === "credit" ? "credit" : "normal")}
							>
								<option value="normal">普通账户</option>
								<option value="credit">信用账户</option>
							</select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="settingMode">默认交易模式</Label>
							<select
								id="settingMode"
								className="bg-background w-full rounded-md border px-3 py-2 text-sm"
								value={positionMode}
								onChange={(e) => setPositionMode(e.target.value === "short" ? "short" : "long")}
							>
								<option value="long">做多</option>
								<option value="short">做空</option>
							</select>
						</div>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={autoLogoutNight}
							onChange={(e) => setAutoLogoutNight(e.target.checked)}
						/>
						夜间自动登出
					</label>
					<div>
						<Button onClick={() => void saveSettings()}>保存设置</Button>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
