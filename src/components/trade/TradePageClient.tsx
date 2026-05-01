"use client";

import {
	ArrowLeft,
	CircleSlash,
	Crown,
	Gamepad2,
	LineChart,
	Loader2,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";
import { cn } from "@/lib/utils";

type AccountResp = {
	id: string;
	account_name: string;
	current_balance: number;
	frozen_balance: number;
	total_assets: number;
};

type PosRow = {
	symbol: string;
	name: string | null;
	quantity: number;
	available_qty: number;
	frozen_qty: number;
	cost_price: number;
	market_value: number;
	current_price: number;
};

type OrderRow = {
	id: string;
	symbol: string;
	name?: string | null;
	side: string;
	price: number;
	quantity: number;
	filled_qty: number;
	status: string;
	created_at: string;
};

type TradeRow = {
	id: string;
	order_id: string | null;
	symbol: string;
	name?: string | null;
	side: string;
	price: number;
	quantity: number;
	commission: number;
	stamp_tax: number;
	trade_time: string;
};

type QuoteResp = {
	symbol: string;
	price: number;
	name?: string;
	source: "tushare" | "sina";
	instrument: "stock" | "etf" | "cbond";
	lot_size: number;
	limit_band_ratio: number;
};

type ChallengeResp = {
	code: string;
	name: string;
	durationMin: number;
	objective: string;
	rewardTitle: string;
	progress: {
		played: number;
		bestTalent: number;
	};
};

type LeaderboardRow = {
	rank: number;
	userTag: string;
	talentScore: number;
	challengeName: string;
	createdAt: string;
};

type CurrentMembership = {
	plan: "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
	trialDaysLeft?: number;
};

function fmtMoney(n: number) {
	const v = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
	return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hkTime(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		timeZone: "Asia/Hong_Kong",
		hour12: false,
	});
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

export function TradePageClient() {
	const t = useTranslations("Trade");
	const tCommon = useTranslations("Common");
	const locale = useLocale();
	const router = useRouter();

	const [sessionReady, setSessionReady] = useState(false);

	const [account, setAccount] = useState<AccountResp | null>(null);
	const [positions, setPositions] = useState<PosRow[]>([]);
	const [orders, setOrders] = useState<OrderRow[]>([]);
	const [tradesList, setTradesList] = useState<TradeRow[]>([]);

	const [symbol, setSymbol] = useState("");
	const [priceStr, setPriceStr] = useState("");
	const [qtyStr, setQtyStr] = useState("");
	const [orderLoading, setOrderLoading] = useState(false);

	const [bootLoading, setBootLoading] = useState(true);
	const [marketLoading, setMarketLoading] = useState(false);
	const [trainingLoading, setTrainingLoading] = useState(false);

	const [quote, setQuote] = useState<QuoteResp | null>(null);
	const [challenges, setChallenges] = useState<ChallengeResp[]>([]);
	const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
	const [membershipHint, setMembershipHint] = useState<CurrentMembership | null>(null);

	const loadAccount = useCallback(async () => {
		const res = await fetch("/api/trade/account", { credentials: "include" });
		const json = await parseJson<{ success: boolean; data?: AccountResp; error?: string }>(res);
		if (!json.success || !json.data) {
			throw new Error(json.error ?? t("toast.loadAccountFailed"));
		}
		setAccount(json.data);
	}, [t]);

	const loadMarketData = useCallback(async () => {
		setMarketLoading(true);
		try {
			const [pRes, oRes, trRes] = await Promise.all([
				fetch(`/api/trade/positions?locale=${encodeURIComponent(locale)}`, { credentials: "include" }),
				fetch(`/api/trade/orders?locale=${encodeURIComponent(locale)}`, { credentials: "include" }),
				fetch(`/api/trade/trades?locale=${encodeURIComponent(locale)}`, { credentials: "include" }),
			]);

			const [pJson, oJson, trJson] = await Promise.all([
				parseJson<{ success: boolean; data?: PosRow[]; error?: string }>(pRes),
				parseJson<{ success: boolean; data?: OrderRow[]; error?: string }>(oRes),
				parseJson<{ success: boolean; data?: TradeRow[]; error?: string }>(trRes),
			]);

			if (!pJson.success || pJson.data === undefined) {
				throw new Error(pJson.error ?? t("toast.loadPositionsFailed"));
			}
			if (!oJson.success || oJson.data === undefined) {
				throw new Error(oJson.error ?? t("toast.loadOrdersFailed"));
			}
			if (!trJson.success || trJson.data === undefined) {
				throw new Error(trJson.error ?? t("toast.loadTradesFailed"));
			}

			setPositions(pJson.data);
			setOrders(oJson.data);
			setTradesList(trJson.data);
		} finally {
			setMarketLoading(false);
		}
	}, [locale, t]);

	const loadTrainingData = useCallback(async () => {
		setTrainingLoading(true);
		try {
			const [challengeRes, boardRes] = await Promise.all([
				fetch("/api/training/challenges", { credentials: "include" }),
				fetch("/api/training/leaderboard", { credentials: "include" }),
			]);

			const [challengeJson, boardJson] = await Promise.all([
				parseJson<{ success: boolean; data?: ChallengeResp[] }>(challengeRes),
				parseJson<{ success: boolean; data?: LeaderboardRow[] }>(boardRes),
			]);
			if (challengeJson.success && challengeJson.data) setChallenges(challengeJson.data);
			if (boardJson.success && boardJson.data) setLeaderboard(boardJson.data);
		} finally {
			setTrainingLoading(false);
		}
	}, []);

	const loadInitial = useCallback(async () => {
		setBootLoading(true);
		try {
			await Promise.all([loadAccount(), loadMarketData(), loadTrainingData()]);
		} catch (e) {
			const msg =
				e instanceof Error
					? e.message === "NETWORK_JSON"
						? t("toast.networkJson")
						: e.message
					: t("toast.loadFailed");
			toast.error(msg);
		} finally {
			setBootLoading(false);
		}
	}, [loadAccount, loadMarketData, loadTrainingData, t]);

	useEffect(() => {
		let cancelled = false;
		async function guard() {
			try {
				const res = await fetch("/api/trade/account", { credentials: "include" });
				const json = await parseJson<{ success: boolean; code?: string }>(res);
				if (cancelled) return;
				if (res.ok && json.success) {
					setSessionReady(true);
					return;
				}
				if (json.code === "TRIAL_EXPIRED" || json.code === "MEMBERSHIP_FORBIDDEN") {
					router.replace("/my-learning");
					return;
				}
				router.replace("/register");
				return;
			} catch {
				if (cancelled) return;
				toast.error(t("toast.network"));
			}
		}
		void guard();
		return () => {
			cancelled = true;
		};
	}, [router, t]);

	useEffect(() => {
		if (!sessionReady) return;
		const timer = window.setTimeout(() => {
			void loadInitial();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [sessionReady, loadInitial]);

	useEffect(() => {
		if (!sessionReady) return;
		const timer = window.setTimeout(async () => {
			try {
				const res = await fetch("/api/membership/current", { credentials: "include" });
				const json = await parseJson<{ success?: boolean; data?: CurrentMembership }>(res);
				if (res.ok && json.success && json.data) {
					setMembershipHint(json.data);
				}
			} catch {
				// ignore
			}
		}, 50);
		return () => window.clearTimeout(timer);
	}, [sessionReady]);

	useEffect(() => {
		if (!sessionReady) return;
		const timer = window.setInterval(() => {
			void loadMarketData().catch(() => {});
		}, 5000);
		return () => window.clearInterval(timer);
	}, [sessionReady, loadMarketData]);

	const positionsMarketValue = useMemo(() => {
		if (!account) return 0;
		const raw = account.total_assets - account.current_balance - account.frozen_balance;
		return Math.max(0, Math.round(raw * 100) / 100);
	}, [account]);

	const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);
	const normalizedMappedSymbol = useMemo(
		() => mapUserSymbolToSina(normalizedSymbol)?.displaySymbol.toUpperCase() ?? normalizedSymbol,
		[normalizedSymbol],
	);

	const selectedPosition = useMemo(() => {
		if (!normalizedSymbol) return null;
		return (
			positions.find((p) => p.symbol.trim().toUpperCase() === normalizedSymbol) ?? null
		);
	}, [normalizedSymbol, positions]);

	const activeQuote = useMemo(() => {
		if (!normalizedSymbol) return null;
		if (!quote) return null;
		const quoteSymbol = quote.symbol.trim().toUpperCase();
		const quoteMapped = mapUserSymbolToSina(quoteSymbol)?.displaySymbol.toUpperCase() ?? quoteSymbol;
		return quoteMapped === normalizedMappedSymbol ? quote : null;
	}, [normalizedMappedSymbol, normalizedSymbol, quote]);

	useEffect(() => {
		if (!normalizedSymbol) return;
		const timer = window.setTimeout(async () => {
			try {
				const quoteRes = await fetch(
					`/api/market/quote?symbol=${encodeURIComponent(normalizedSymbol)}&locale=${encodeURIComponent(locale)}`,
					{ credentials: "include" },
				);
				const json = await parseJson<{ success: boolean; data?: QuoteResp }>(quoteRes);
				if (json.success && json.data) {
					setQuote(json.data);
					if (!priceStr) setPriceStr(String(json.data.price));
				}
			} catch {
				// ignore quote failures
			}
		}, 300);
		return () => window.clearTimeout(timer);
	}, [locale, normalizedSymbol, priceStr]);

	const validateInputs = (): { price: number; quantity: number } | null => {
		const px = Number(priceStr);
		const qty = Number(qtyStr);

		if (!normalizedSymbol.length) {
			toast.error(t("validation.symbolRequired"));
			return null;
		}
		if (!Number.isFinite(px) || px <= 0) {
			toast.error(t("validation.price"));
			return null;
		}
		if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
			toast.error(t("validation.quantityInt"));
			return null;
		}
		const lotSize = activeQuote?.lot_size ?? 100;
		if (qty % lotSize !== 0) {
			toast.error(`${t("validation.quantityStep")}（${lotSize}）`);
			return null;
		}

		return { price: px, quantity: qty };
	};

	const refreshAllAfterSuccess = useCallback(async () => {
		await Promise.all([loadAccount(), loadMarketData(), loadTrainingData()]);
	}, [loadAccount, loadMarketData, loadTrainingData]);

	const submitOrder = async (side: "buy" | "sell") => {
		const vals = validateInputs();
		if (!vals) return;

		setOrderLoading(true);
		try {
			const res = await fetch("/api/trade/order", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					symbol: normalizedSymbol,
					side,
					price: vals.price,
					quantity: vals.quantity,
				}),
			});
			let json = { success: false } as Record<string, unknown>;
			try {
				json = (await parseJson<Record<string, unknown>>(res)) as Record<string, unknown>;
			} catch {
				toast.error(t("toast.networkJson"));
				return;
			}

			if (!res.ok && typeof json.error === "string") {
				toast.error(json.error);
				return;
			}

			if (json.success === true) {
				toast.success(t("toast.orderOk"));
				await refreshAllAfterSuccess();
				return;
			}

			if (typeof json.message === "string" && json.message) {
				toast.warning(json.message);
				await refreshAllAfterSuccess();
				return;
			}
			if (typeof json.error === "string" && json.error) {
				toast.error(json.error);
				return;
			}
			toast.error(t("toast.orderFailed"));
		} catch {
			toast.error(t("toast.network"));
		} finally {
			setOrderLoading(false);
		}
	};

	const handleClosePositions = () => {
		toast.message(t("toast.closePlaceholder"));
	};

	const runChallenge = async (challenge: ChallengeResp) => {
		setTrainingLoading(true);
		try {
			const res = await fetch("/api/training/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					challengeCode: challenge.code,
				}),
			});
			const json = await parseJson<{ success: boolean; error?: string }>(res);
			if (!json.success) {
				toast.error(json.error ?? "挑战提交失败");
				return;
			}
			toast.success(`已完成挑战：${challenge.name}`);
			await loadTrainingData();
		} catch {
			toast.error("挑战提交失败");
		} finally {
			setTrainingLoading(false);
		}
	};

	const orderStatusVariant = (s: string) => {
		switch (s) {
			case "filled":
				return "success" as const;
			case "pending":
				return "muted" as const;
			case "partial":
				return "outline" as const;
			case "cancelled":
				return "muted" as const;
			case "rejected":
				return "warning" as const;
			default:
				return "secondary" as const;
		}
	};

	if (!sessionReady) {
		return (
			<main className="flex min-h-[50vh] items-center justify-center px-6">
				<Loader2 className="size-10 animate-spin text-cyan-400/80" aria-hidden />
			</main>
		);
	}

	return (
		<>
			<main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:gap-8 md:py-12">
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.22]"
					aria-hidden
				>
					<div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_42%_at_85%_-5%,oklch(0.48_0.18_265/0.35),transparent)]" />
				</div>

				<div className="relative z-10 space-y-4">
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						<ArrowLeft className="size-4" />
						{tCommon("backHome")}
					</Link>

					<header className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("title")}</h1>
						<p className="text-muted-foreground text-sm">{t("subtitle")}</p>
					</header>
					{membershipHint?.plan === "T0_trial" ? (
						<div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
							试用期还剩 {membershipHint.trialDaysLeft ?? 0} 天，升级会员可持续使用模拟交易和 TQ 评分。
							<Link href="/membership" className="ml-2 underline underline-offset-2">
								立即升级
							</Link>
						</div>
					) : null}
					{membershipHint?.plan === "T0_paid" ? (
						<div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
							您的 T0 试用已结束，请升级会员继续交易训练。
							<Link href="/membership" className="ml-2 underline underline-offset-2">
								去升级
							</Link>
						</div>
					) : null}
				</div>

				<div className="relative z-10 grid gap-6 lg:grid-cols-12 lg:gap-8">
					<section className="order-1 space-y-5 lg:col-span-7">
						<Card className="border-cyan-500/25 bg-card/60 backdrop-blur-sm">
							<CardHeader>
								<div className="flex items-center gap-3">
									<span className="flex size-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30">
										<TrendingUp className="size-5" />
									</span>
									<div>
										<CardTitle>{t("panel.placeOrder")}</CardTitle>
										<CardDescription>{t("panel.placeHint")}</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="symbol">{t("form.symbol")}</Label>
										<Input
											id="symbol"
											inputMode="text"
											autoCapitalize="characters"
											placeholder={t("form.symbolPlaceholder")}
											value={symbol}
											onChange={(e) => setSymbol(e.target.value)}
											disabled={bootLoading || orderLoading}
										/>
									</div>
									<div className="flex flex-col justify-end space-y-2">
										<div className="flex items-center justify-between gap-2">
											<Label>{t("form.lastPrice")}</Label>
											<span className="font-mono text-muted-foreground text-sm">
											{activeQuote ? fmtMoney(activeQuote.price) : "--"}
											</span>
										</div>
										<div className="text-muted-foreground text-xs">
											{activeQuote?.name ? `${t("table.name")}：${activeQuote.name}` : `${t("table.name")}：—`}
										</div>
										{activeQuote && (
											<p className="text-muted-foreground text-xs">
												{activeQuote.instrument.toUpperCase()} · {activeQuote.source.toUpperCase()} ·
												手数 {activeQuote.lot_size}
											</p>
										)}
									</div>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="price">{t("form.price")}</Label>
										<Input
											id="price"
											inputMode="decimal"
											placeholder="0.0000"
											value={priceStr}
											onChange={(e) => setPriceStr(e.target.value)}
											disabled={bootLoading || orderLoading}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="qty">{t("form.quantity")}</Label>
										<Input
											id="qty"
											inputMode="numeric"
											placeholder={t("form.quantityPlaceholder")}
											value={qtyStr}
											onChange={(e) => setQtyStr(e.target.value)}
											disabled={bootLoading || orderLoading}
										/>
										<p className="text-muted-foreground text-xs">{t("form.quantityHint")}</p>
									</div>
								</div>

								<div className="grid gap-2 rounded-xl border border-border/60 bg-background/60 p-4 text-sm sm:grid-cols-2">
									<div className="space-y-1">
										<span className="text-muted-foreground">{t("form.availableFunds")}</span>
										<div className="font-mono tabular-nums">
											{bootLoading && !account
												? "—"
												: `${fmtMoney(account?.current_balance ?? 0)}`}
										</div>
									</div>
									<div className="space-y-1 sm:text-end">
										<span className="text-muted-foreground">{t("form.sellable")}</span>
										<div className="font-mono tabular-nums">
											{selectedPosition?.available_qty != null ? selectedPosition.available_qty : "—"}
										</div>
									</div>
									<div className="space-y-1">
										<span className="text-muted-foreground">涨跌停范围</span>
										<div className="font-mono tabular-nums">
											{activeQuote ? `±${(activeQuote.limit_band_ratio * 100).toFixed(0)}%` : "—"}
										</div>
									</div>
									<div className="space-y-1 sm:text-end">
										<span className="text-muted-foreground">T+0训练模式</span>
										<div className="font-mono tabular-nums text-cyan-200">已启用</div>
									</div>
								</div>

								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										disabled={orderLoading || bootLoading}
										className="bg-rose-600 text-white hover:bg-rose-500"
										onClick={() => void submitOrder("buy")}
									>
										{orderLoading ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<TrendingUp className="size-4" />
										)}
										{t("panel.buy")}
									</Button>
									<Button
										type="button"
										disabled={orderLoading || bootLoading}
										className="bg-emerald-600 text-white hover:bg-emerald-500"
										onClick={() => void submitOrder("sell")}
									>
										{orderLoading ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<TrendingDown className="size-4" />
										)}
										{t("panel.sell")}
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={orderLoading || bootLoading}
										className="border-amber-500/55 bg-amber-500/10 text-amber-100 hover:bg-amber-500/18"
										onClick={handleClosePositions}
									>
										<CircleSlash className="size-4" />
										{t("panel.flat")}
									</Button>
									{(bootLoading || marketLoading) && !orderLoading && (
										<span className="flex items-center text-muted-foreground text-xs">
											{t("status.syncing")}
										</span>
									)}
								</div>
							</CardContent>
						</Card>
					</section>

					<section className="order-2 space-y-3 lg:col-span-5">
						<Card className="border-cyan-500/25 bg-card/65 backdrop-blur-sm">
							<CardHeader>
								<div className="flex items-center gap-2">
									<LineChart className="size-5 text-cyan-300/90" aria-hidden />
									<div>
										<CardTitle>{t("overview.title")}</CardTitle>
										<CardDescription>{t("overview.hint")}</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="grid gap-3 sm:grid-cols-2">
								<SummaryTile
									label={t("overview.total")}
									valueDisplay={bootLoading && !account ? "—" : fmtMoney(account?.total_assets ?? 0)}
									emphasis
								/>
								<SummaryTile
									label={t("overview.available")}
									valueDisplay={
										bootLoading && !account ? "—" : fmtMoney(account?.current_balance ?? 0)
									}
								/>
								<SummaryTile
									label={t("overview.posMv")}
									valueDisplay={bootLoading && !account ? "—" : fmtMoney(positionsMarketValue)}
								/>
								<SummaryTile
									label={t("overview.frozen")}
									valueDisplay={
										bootLoading && !account ? "—" : fmtMoney(account?.frozen_balance ?? 0)
									}
								/>
								<SummaryTile
									label={t("overview.dayPnl")}
									valueDisplay={`${fmtMoney(0)} (${t("overview.notImplemented")})`}
								/>
							</CardContent>
						</Card>
					</section>

					<section className="order-3 lg:col-span-12">
						<Tabs defaultValue="positions" className="w-full">
							<TabsList className="flex w-full flex-wrap gap-1 sm:w-auto md:inline-flex md:h-auto md:flex-row md:p-1">
								<TabsTrigger value="positions">{t("tabs.positions")}</TabsTrigger>
								<TabsTrigger value="orders">{t("tabs.orders")}</TabsTrigger>
								<TabsTrigger value="trades">{t("tabs.trades")}</TabsTrigger>
								<TabsTrigger value="challenges">挑战大厅</TabsTrigger>
								<TabsTrigger value="leaderboard">排行榜</TabsTrigger>
							</TabsList>

							<TabsContent value="positions" className="space-y-2">
								<p className="text-muted-foreground text-xs">{t("tabs.positionsHint")}</p>
								<div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{t("table.symbol")}</TableHead>
												<TableHead>{t("table.name")}</TableHead>
												<TableHead className="text-end">{t("table.qty")}</TableHead>
												<TableHead className="text-end">{t("table.cost")}</TableHead>
												<TableHead className="text-end">{t("table.curPrice")}</TableHead>
												<TableHead className="text-end">{t("table.mv")}</TableHead>
												<TableHead className="text-end">{t("table.pnl")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(positions ?? []).length === 0 ? (
												<TableRow>
													<TableCell
														colSpan={7}
														className="text-muted-foreground text-center py-8"
													>
														{t("empty")}
													</TableCell>
												</TableRow>
											) : (
												positions.map((p) => {
													const pn =
														((p.current_price ?? p.cost_price) - p.cost_price) *
														Math.max(p.quantity, 0);
													const pnR = Math.round(pn * 100) / 100;
													return (
														<TableRow key={`${p.symbol}-${p.quantity}`}>
															<TableCell className="font-medium">{p.symbol}</TableCell>
															<TableCell className="text-muted-foreground">
																{p.name ?? "—"}
															</TableCell>
															<TableCell className="text-end">{p.quantity}</TableCell>
															<TableCell className="text-end">{fmtMoney(p.cost_price)}</TableCell>
															<TableCell className="text-end">
																{fmtMoney(p.current_price)}
															</TableCell>
															<TableCell className="text-end">{fmtMoney(p.market_value)}</TableCell>
															<TableCell
																className={cn(
																	"text-end font-medium tabular-nums",
																	pnR > 0 ? "text-emerald-400" : pnR < 0 ? "text-rose-400" : "",
																)}
															>
																{fmtMoney(pnR)}
															</TableCell>
														</TableRow>
													);
												})
											)}
										</TableBody>
									</Table>
								</div>
								<p className="text-muted-foreground text-xs">{t("table.pnlExplain")}</p>
							</TabsContent>

							<TabsContent value="orders" className="space-y-2">
								<div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{t("table.time")}</TableHead>
												<TableHead>{t("table.symbol")}</TableHead>
												<TableHead>{t("table.name")}</TableHead>
												<TableHead>{t("table.direction")}</TableHead>
												<TableHead className="text-end">{t("table.price")}</TableHead>
												<TableHead className="text-end">{t("table.quantity")}</TableHead>
												<TableHead className="text-end">{t("table.filledQty")}</TableHead>
												<TableHead>{t("table.statusLabel")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(orders ?? []).length === 0 ? (
												<TableRow>
													<TableCell
														colSpan={8}
														className="text-muted-foreground text-center py-8"
													>
														{t("empty")}
													</TableCell>
												</TableRow>
											) : (
												orders.map((o) => (
													<TableRow key={o.id}>
														<TableCell className="whitespace-nowrap text-xs">
															{hkTime(o.created_at)}
														</TableCell>
														<TableCell>{o.symbol}</TableCell>
														<TableCell className="text-muted-foreground">{o.name ?? "—"}</TableCell>
														<TableCell>{t(`direction.${o.side}` as never)}</TableCell>
														<TableCell className="text-end">{fmtMoney(o.price)}</TableCell>
														<TableCell className="text-end">{o.quantity}</TableCell>
														<TableCell className="text-end">{o.filled_qty}</TableCell>
														<TableCell>
															<Badge variant={orderStatusVariant(o.status)}>
																{t(`orderStatus.${o.status}` as never)}
															</Badge>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</TabsContent>

							<TabsContent value="trades" className="space-y-2">
								<div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{t("table.time")}</TableHead>
												<TableHead>{t("table.symbol")}</TableHead>
												<TableHead>{t("table.name")}</TableHead>
												<TableHead>{t("table.direction")}</TableHead>
												<TableHead className="text-end">{t("table.price")}</TableHead>
												<TableHead className="text-end">{t("table.quantity")}</TableHead>
												<TableHead className="text-end">{t("table.fees")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(tradesList ?? []).length === 0 ? (
												<TableRow>
													<TableCell
														colSpan={7}
														className="text-muted-foreground text-center py-8"
													>
														{t("empty")}
													</TableCell>
												</TableRow>
											) : (
												tradesList.map((tr) => (
													<TableRow key={tr.id}>
														<TableCell className="whitespace-nowrap text-xs">
															{hkTime(tr.trade_time)}
														</TableCell>
														<TableCell>{tr.symbol}</TableCell>
														<TableCell className="text-muted-foreground">{tr.name ?? "—"}</TableCell>
														<TableCell>{t(`direction.${tr.side}` as never)}</TableCell>
														<TableCell className="text-end">{fmtMoney(tr.price)}</TableCell>
														<TableCell className="text-end">{tr.quantity}</TableCell>
														<TableCell className="text-end">
															{fmtMoney(tr.commission + tr.stamp_tax)}
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</TabsContent>

							<TabsContent value="challenges" className="space-y-3">
								<div className="grid gap-3 md:grid-cols-2">
									{(challenges ?? []).map((c) => (
										<Card key={c.code} className="bg-card/40">
											<CardHeader className="pb-2">
												<CardTitle className="flex items-center justify-between text-base">
													<span>{c.name}</span>
													<Gamepad2 className="size-4 text-cyan-300" />
												</CardTitle>
												<CardDescription>{c.objective}</CardDescription>
											</CardHeader>
											<CardContent className="space-y-2 text-sm">
												<div className="text-muted-foreground">
													时长：{c.durationMin} 分钟 · 称号：{c.rewardTitle}
												</div>
												<div className="text-muted-foreground">
													已挑战 {c.progress.played} 次 · 最佳天赋分{" "}
													{c.progress.bestTalent.toFixed(2)}
												</div>
												<Button
													size="sm"
													disabled={trainingLoading}
													onClick={() => void runChallenge(c)}
												>
													{trainingLoading ? <Loader2 className="size-4 animate-spin" /> : null}
													开始挑战
												</Button>
											</CardContent>
										</Card>
									))}
								</div>
							</TabsContent>

							<TabsContent value="leaderboard" className="space-y-2">
								<div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>#</TableHead>
												<TableHead>用户</TableHead>
												<TableHead>挑战</TableHead>
												<TableHead className="text-end">天赋分</TableHead>
												<TableHead className="text-end">时间</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(leaderboard ?? []).length === 0 ? (
												<TableRow>
													<TableCell colSpan={5} className="text-center text-muted-foreground py-8">
														暂无排行榜数据
													</TableCell>
												</TableRow>
											) : (
												leaderboard.map((r) => (
													<TableRow key={`${r.rank}-${r.createdAt}`}>
														<TableCell className="font-medium">
															{r.rank <= 3 ? <Crown className="size-4 inline text-amber-400" /> : null}{" "}
															{r.rank}
														</TableCell>
														<TableCell>{r.userTag}</TableCell>
														<TableCell>{r.challengeName}</TableCell>
														<TableCell className="text-end">{r.talentScore.toFixed(2)}</TableCell>
														<TableCell className="text-end text-xs">{hkTime(r.createdAt)}</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</TabsContent>
						</Tabs>
					</section>
				</div>
			</main>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}

function SummaryTile({
	label,
	valueDisplay,
	emphasis,
}: {
	label: string;
	valueDisplay: string;
	emphasis?: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-lg border px-4 py-3",
				emphasis ? "border-cyan-400/35 bg-white/5 md:py-4" : "border-border/50 bg-muted/10",
			)}
		>
			<div className="text-muted-foreground text-xs">{label}</div>
			<div
				className={cn(
					"mt-1 font-mono text-lg tracking-tight tabular-nums",
					emphasis && "text-xl text-cyan-100 md:text-2xl",
				)}
			>
				{valueDisplay}
			</div>
		</div>
	);
}
