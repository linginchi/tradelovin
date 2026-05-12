"use client";

import { CheckCircle2, Loader2, Target, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PracticeTargetHighlighter } from "@/components/practice/PracticeTargetHighlighter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVELS, type PracticeExpected, type PracticeLevel } from "@/lib/practice/levels";
import { verifyPracticeStep } from "@/lib/practice/verify";

type StepScoreMap = Record<string, number>;
type PracticeLog = {
	levelId: string;
	stepId: string;
	userInput: Record<string, unknown>;
	correct: boolean | null;
	scoreDelta: number;
	timestamp: string;
};

type CompletePayload = {
	levelId: string;
	finalScore: number;
	stepResults: Array<{ stepId: string; correct: boolean; scoreDelta: number }>;
	logs: PracticeLog[];
	newStage?: {
		key: string;
		title: string;
		description: string;
		icon: string;
	} | null;
	currentStage?: {
		key: string;
		title: string;
		description: string;
		icon: string;
	} | null;
};

type Props = {
	levelId: string;
	onBack: () => void;
	onCompleted?: (payload: CompletePayload & { newTotalScore?: number }) => void;
};

const MOCK_STOCK = { symbol: "000001", name: "平安银行" };
const LOG_STORAGE_KEY = "practice:logs:v1";

function getProgressPercent(currentStepIndex: number, stepsLen: number, completed: boolean): number {
	if (stepsLen <= 0) return 0;
	if (completed) return 100;
	return Math.round((currentStepIndex / stepsLen) * 100);
}

function readStoredLogs(): PracticeLog[] {
	try {
		const raw = globalThis.localStorage?.getItem(LOG_STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? (parsed as PracticeLog[]) : [];
	} catch {
		return [];
	}
}

export function PracticeSession({ levelId, onBack, onCompleted }: Props) {
	const level: PracticeLevel | null = LEVELS[levelId] ?? null;
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [stepScores, setStepScores] = useState<StepScoreMap>({});
	const [totalScore, setTotalScore] = useState(0);
	const [completed, setCompleted] = useState(false);
	const [practiceMode, setPracticeMode] = useState(false);
	const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
	const [logs, setLogs] = useState<PracticeLog[]>([]);

	const [searchInput, setSearchInput] = useState("");
	const [selectedSymbol, setSelectedSymbol] = useState("");
	const [selectedPositionSymbol, setSelectedPositionSymbol] = useState("");
	const [selectedOrderId, setSelectedOrderId] = useState("");
	const [quantityInput, setQuantityInput] = useState("");
	const [activeView, setActiveView] = useState<"trade" | "orders" | "positions" | "resources">("trade");
	const [positionMode, setPositionMode] = useState<"long" | "short">("long");
	const [resourceSide, setResourceSide] = useState<"long" | "short">("long");
	const [orderStatus, setOrderStatus] = useState<"pending" | "filled" | "idle">("idle");
	const [mockOrderList, setMockOrderList] = useState([
		{ id: "ord-001", symbol: "000001", side: "buy", status: "pending" as "pending" | "filled" | "cancelled" },
	]);
	const [submittingOrder, setSubmittingOrder] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [completing, setCompleting] = useState(false);
	const [aborting, setAborting] = useState(false);
	const [showHighlighter, setShowHighlighter] = useState(true);

	const steps = level?.steps ?? [];
	const currentStep = steps[currentStepIndex] ?? null;
	const progressPercent = getProgressPercent(currentStepIndex, steps.length, completed);
	const hasMockSearchResult = searchInput.includes("000001");
	const persistLog = (entry: PracticeLog) => {
		const merged = [...readStoredLogs(), entry];
		globalThis.localStorage?.setItem(LOG_STORAGE_KEY, JSON.stringify(merged));
	};

	const flushLogsToServer = async (payloadLogs: PracticeLog[]) => {
		if (payloadLogs.length === 0) return;
		try {
			await fetch("/api/practice/log", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ logs: payloadLogs }),
			});
		} catch {
			// 网络异常下保留本地日志，后续可继续补偿
		}
	};

	const verifyStep = async (userInput: Record<string, unknown>) => {
		if (!currentStep) return;
		if (verifying || completing) return;
		setVerifying(true);

		let correct = false;
		let fallbackUsed = false;
		try {
			const res = await fetch("/api/practice/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					levelId,
					stepId: currentStep.id,
					userInput,
				}),
			});
			const json = (await res.json()) as { correct?: unknown; message?: unknown };
			correct = json.correct === true;
		} catch {
			fallbackUsed = true;
			correct = verifyPracticeStep(levelId, currentStep.id, userInput).correct;
		}

		const previousDelta = stepScores[currentStep.id];
		let scoreDelta = 0;
		const nextStepScores: StepScoreMap = { ...stepScores };
		let nextTotal = totalScore;

		if (correct) {
			if (previousDelta === undefined) {
				nextStepScores[currentStep.id] = 1;
				scoreDelta = 1;
			} else if (previousDelta < 0) {
				nextStepScores[currentStep.id] = 0;
				scoreDelta = 1;
			}
			nextTotal += scoreDelta;
			setFeedback({ ok: true, text: fallbackUsed ? "步骤正确，+1 分（离线校验）" : "步骤正确，+1 分" });
		} else {
			if (previousDelta === undefined) {
				nextStepScores[currentStep.id] = -1;
				scoreDelta = -1;
			}
			nextTotal += scoreDelta;
			setFeedback({ ok: false, text: fallbackUsed ? "输入不正确（离线校验），请重试" : "输入或操作不正确，请按提示重试" });
		}

		const logEntry: PracticeLog = {
			levelId,
			stepId: currentStep.id,
			userInput,
			correct,
			scoreDelta,
			timestamp: new Date().toISOString(),
		};
		const nextLogs = [...logs, logEntry];

		setStepScores(nextStepScores);
		setTotalScore(nextTotal);
		setLogs(nextLogs);
		persistLog(logEntry);

		if (!correct) {
			setVerifying(false);
			return;
		}
		const nextIndex = currentStepIndex + 1;
		if (nextIndex >= steps.length) {
			setCompleting(true);
			let newTotalScore: number | undefined;
			const completeLog: PracticeLog = {
				levelId,
				stepId: "complete",
				userInput: { action: "complete" },
				correct: true,
				scoreDelta: 0,
				timestamp: new Date().toISOString(),
			};
			const completeLogs = [...nextLogs, completeLog];
			try {
				const completeRes = await fetch("/api/practice/complete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						levelId,
						finalScore: nextTotal,
						logs: completeLogs,
					}),
				});
				const completeJson = (await completeRes.json()) as {
					newTotalScore?: unknown;
					newStage?: unknown;
					currentStage?: unknown;
				};
				const score = Number(completeJson.newTotalScore);
				if (Number.isFinite(score)) newTotalScore = score;
				const newStage =
					completeJson.newStage && typeof completeJson.newStage === "object"
						? (completeJson.newStage as CompletePayload["newStage"])
						: null;
				const currentStage =
					completeJson.currentStage && typeof completeJson.currentStage === "object"
						? (completeJson.currentStage as CompletePayload["currentStage"])
						: null;
				setCompleted(true);
				console.log("[practice logs]", completeLogs);
				onCompleted?.({
					levelId,
					finalScore: nextTotal,
					stepResults: steps.map((step) => ({
						stepId: step.id,
						correct: true,
						scoreDelta: nextStepScores[step.id] ?? 0,
					})),
					logs: completeLogs,
					newTotalScore,
					newStage,
					currentStage,
				});
				setVerifying(false);
				return;
			} catch {
				toast.warning("练习已完成，后端暂不可用，已保留本地记录");
			} finally {
				setCompleting(false);
			}
			setCompleted(true);
			console.log("[practice logs]", completeLogs);
			onCompleted?.({
				levelId,
				finalScore: nextTotal,
				stepResults: steps.map((step) => ({
					stepId: step.id,
					correct: true,
					scoreDelta: nextStepScores[step.id] ?? 0,
				})),
				logs: completeLogs,
				newTotalScore,
				newStage: null,
				currentStage: null,
			});
			setVerifying(false);
			return;
		}
		setShowHighlighter(true);
		setCurrentStepIndex(nextIndex);
		setVerifying(false);
	};

	const tryVerify = async (expectedType: PracticeExpected["type"], userInput: Record<string, unknown>) => {
		if (!currentStep) return;
		if (currentStep.expected.type !== expectedType) return;
		setShowHighlighter(false);
		await verifyStep(userInput);
	};

	const handleAbortPractice = async () => {
		if (!practiceMode || completed) {
			onBack();
			return;
		}
		if (!window.confirm("确认退出本次练习？当前进度将结束并记录为退出。")) return;
		setAborting(true);
		const abortLog: PracticeLog = {
			levelId,
			stepId: "abort",
			userInput: { action: "abort" },
			correct: null,
			scoreDelta: 0,
			timestamp: new Date().toISOString(),
		};
		const payloadLogs = [...logs, abortLog];
		await flushLogsToServer(payloadLogs);
		persistLog(abortLog);
		setAborting(false);
		onBack();
	};

	const statusText = useMemo(() => {
		if (orderStatus === "pending") return "已报";
		if (orderStatus === "filled") return "成交";
		if (orderStatus === "idle") return "未提交";
		return "未提交";
	}, [orderStatus]);

	const currentTargetKey = useMemo(() => {
		if (!currentStep) return null;
		const expected = currentStep.expected;
		switch (expected.type) {
			case "search":
				return "search-input";
			case "select":
				return `stock-item-${expected.symbol}`;
			case "quantity":
				return "quantity-input";
			case "click_buy":
				return "buy-button";
			case "click_sell":
				return "sell-button";
			case "confirm":
				return "confirm-button";
			case "confirm_apply_resource":
				return "confirm-apply-resource";
			case "order_status":
				return "order-status-button";
			case "view_orders":
				return "tab-orders";
			case "select_order": {
				const targetOrder = mockOrderList.find((order) => order.status === expected.status) ?? mockOrderList[0];
				return targetOrder ? `order-item-${targetOrder.id}` : null;
			}
			case "click_cancel":
				return "cancel-button";
			case "position_mode":
				return expected.value === "short" ? "short-mode-button" : "long-mode-button";
			case "resource_side":
				return expected.value === "short" ? "resource-side-short" : "resource-side-long";
			case "click_apply_resource":
				return "apply-resource-button";
			case "confirm_cancel":
				return "confirm-cancel-button";
			case "select_position":
				return `position-item-${expected.symbol}`;
			default:
				return null;
		}
	}, [currentStep, mockOrderList]);

	if (!level) {
		return (
			<div className="rounded-xl border p-6">
				<p className="text-sm text-muted-foreground">关卡不存在</p>
				<Button className="mt-4" variant="outline" onClick={onBack}>
					返回大厅
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4 rounded-2xl border bg-background/80 p-4">
			<PracticeTargetHighlighter
				targetKey={currentTargetKey}
				enabled={Boolean(practiceMode && !completed && showHighlighter && currentStep)}
			/>
			<div className="flex items-center justify-between gap-2">
				<div>
					<p className="text-lg font-semibold">{level.title}</p>
					<p className="text-xs text-muted-foreground">练习模式：仅演示，不会产生真实交易数据</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={practiceMode ? "default" : "secondary"}>{practiceMode ? "练习进行中" : "未开始"}</Badge>
					<Button size="sm" variant="outline" disabled={aborting} onClick={() => void handleAbortPractice()}>
						{aborting ? "退出中..." : "退出练习"}
					</Button>
				</div>
			</div>

			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
			</div>
			<p className="text-xs text-muted-foreground">
				进度：{completed ? steps.length : currentStepIndex}/{steps.length} | 总分：{totalScore} | 日志：{logs.length}
			</p>

			{!practiceMode && (
				<div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
					<p className="text-sm">点击开始后按步骤练习，每步首次错误扣 1 分，正确得 1 分。</p>
					<Button
						className="mt-3"
						onClick={() => {
							setPracticeMode(true);
							setShowHighlighter(true);
						}}
					>
						开始练习
					</Button>
				</div>
			)}

			{practiceMode && !completed && currentStep && (
				<>
					<div className="rounded-lg border bg-card p-3">
						<p className="text-xs text-muted-foreground">当前步骤 {currentStepIndex + 1}</p>
						<p className="mt-1 text-base font-medium">{currentStep.instruction}</p>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant={activeView === "trade" ? "default" : "outline"}
							data-practice-target="tab-trade"
							onClick={() => {
								setActiveView("trade");
							}}
						>
							交易面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "orders" ? "default" : "outline"}
							data-practice-target="tab-orders"
							onClick={() => {
								setActiveView("orders");
								void tryVerify("view_orders", { view: "orders" });
							}}
						>
							委托面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "positions" ? "default" : "outline"}
							data-practice-target="tab-positions"
							onClick={() => setActiveView("positions")}
						>
							持仓面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "resources" ? "default" : "outline"}
							data-practice-target="tab-resources"
							onClick={() => setActiveView("resources")}
						>
							资源面板
						</Button>
					</div>

					<div className="grid gap-3 lg:grid-cols-2">
						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">股票搜索</p>
							<Input
								data-practice-target="search-input"
								value={searchInput}
								placeholder="输入代码，如 000001"
								onChange={(e) => {
									setSearchInput(e.target.value);
								}}
								onBlur={() => {
									void tryVerify("search", { value: searchInput });
								}}
							/>
							{hasMockSearchResult ? (
								<button
									type="button"
									data-practice-target={`stock-item-${MOCK_STOCK.symbol}`}
									className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
									onClick={() => {
										setSelectedSymbol(MOCK_STOCK.symbol);
										void tryVerify("select", { symbol: MOCK_STOCK.symbol, name: MOCK_STOCK.name });
									}}
								>
									{MOCK_STOCK.symbol} - {MOCK_STOCK.name}
								</button>
							) : (
								<p className="text-xs text-muted-foreground">输入 000001 可出现模拟搜索结果</p>
							)}
						</div>

						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">下单参数</p>
							<p className="text-xs text-muted-foreground">已选股票：{selectedSymbol || "未选择"}</p>
							<div className="flex gap-2">
								<Button
									size="sm"
									data-practice-target="long-mode-button"
									variant={positionMode === "long" ? "default" : "outline"}
									onClick={() => {
										setPositionMode("long");
										void tryVerify("position_mode", { value: "long" });
									}}
								>
									做多
								</Button>
								<Button
									size="sm"
									data-practice-target="short-mode-button"
									variant={positionMode === "short" ? "default" : "outline"}
									onClick={() => {
										setPositionMode("short");
										void tryVerify("position_mode", { value: "short" });
									}}
								>
									融券做空
								</Button>
							</div>
							<Input
								data-practice-target="quantity-input"
								value={quantityInput}
								placeholder="数量，如 500 / 1000"
								onChange={(e) => {
									setQuantityInput(e.target.value);
								}}
								onBlur={() => {
									void tryVerify("quantity", { value: Number(quantityInput) });
								}}
							/>
							<div className="flex gap-2">
								<Button
									data-practice-target="buy-button"
									disabled={submittingOrder}
									onClick={() => {
										setSubmittingOrder(true);
										setTimeout(() => {
											setSubmittingOrder(false);
											setOrderStatus(Math.random() > 0.5 ? "pending" : "filled");
											void tryVerify("click_buy", { action: "click_buy" });
										}, 280);
									}}
								>
									{positionMode === "short" ? "买入平空" : "买入"}
								</Button>
								<Button
									data-practice-target="sell-button"
									disabled={submittingOrder}
									variant="destructive"
									onClick={() => {
										setSubmittingOrder(true);
										setTimeout(() => {
											setSubmittingOrder(false);
											setOrderStatus(Math.random() > 0.5 ? "pending" : "filled");
											void tryVerify("click_sell", { action: "click_sell" });
										}, 280);
									}}
								>
									{positionMode === "short" ? "卖出开空" : "卖出"}
								</Button>
							</div>
							<div className="flex gap-2">
								<Button
									data-practice-target="order-status-button"
									variant="outline"
									onClick={() => {
										void tryVerify("order_status", { status: orderStatus });
									}}
								>
									检查状态
								</Button>
								<Button data-practice-target="confirm-button" variant="outline" onClick={() => void tryVerify("confirm", { action: "confirm" })}>
									确认委托/操作完成
								</Button>
							</div>
							<div className="rounded-md bg-muted p-2 text-xs">
								<p>模拟委托状态：{statusText}</p>
							</div>
						</div>

						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">模拟持仓列表</p>
							<button
								type="button"
								data-practice-target="position-item-000001"
								className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
								onClick={() => {
									setSelectedPositionSymbol("000001");
									void tryVerify("select_position", { symbol: "000001" });
								}}
							>
								000001 平安银行（多头可用 1200）
							</button>
							<button
								type="button"
								className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
								onClick={() => {
									setSelectedPositionSymbol("000001");
									setPositionMode("short");
									void tryVerify("select_position", { symbol: "000001" });
								}}
							>
								000001 平安银行（空头可用 600）
							</button>
							<p className="text-xs text-muted-foreground">当前选中持仓：{selectedPositionSymbol || "未选择"}</p>
						</div>

						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">模拟委托与资源</p>
							{mockOrderList.map((order) => (
								<div key={order.id} className="rounded-md border p-2 text-xs">
									<p>
										{order.symbol} / {order.side.toUpperCase()} / {order.status}
									</p>
									<div className="mt-1 flex gap-2">
										<Button
											data-practice-target={`order-item-${order.id}`}
											size="sm"
											variant="outline"
											onClick={() => {
												setSelectedOrderId(order.id);
												void tryVerify("select_order", { status: order.status });
											}}
										>
											选择委托
										</Button>
										<Button
											data-practice-target="cancel-button"
											size="sm"
											variant="outline"
											onClick={() => {
												setMockOrderList((prev) =>
													prev.map((row) => (row.id === order.id ? { ...row, status: "cancelled" } : row)),
												);
												setOrderStatus("pending");
												void tryVerify("click_cancel", { action: "click_cancel" });
											}}
										>
											撤单
										</Button>
									</div>
								</div>
							))}
							<div className="flex gap-2">
								<Button
									data-practice-target="resource-side-long"
									size="sm"
									variant={resourceSide === "long" ? "default" : "outline"}
									onClick={() => {
										setResourceSide("long");
										void tryVerify("resource_side", { value: "long" });
									}}
								>
									多头资源
								</Button>
								<Button
									data-practice-target="resource-side-short"
									size="sm"
									variant={resourceSide === "short" ? "default" : "outline"}
									onClick={() => {
										setResourceSide("short");
										void tryVerify("resource_side", { value: "short" });
									}}
								>
									空头资源
								</Button>
								<Button
									data-practice-target="apply-resource-button"
									size="sm"
									onClick={() => {
										setOrderStatus("pending");
										void tryVerify("click_apply_resource", { action: "click_apply_resource" });
									}}
								>
									申请资源
								</Button>
								<Button
									data-practice-target="confirm-apply-resource"
									size="sm"
									variant="outline"
									onClick={() => void tryVerify("confirm_apply_resource", { action: "confirm_apply_resource" })}
								>
									确认申请成功
								</Button>
							</div>
							<div className="flex gap-2">
								<Button
									data-practice-target="confirm-cancel-button"
									variant="outline"
									size="sm"
									onClick={() => void tryVerify("confirm_cancel", { action: "confirm_cancel" })}
								>
									确认撤单成功
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">当前选中委托：{selectedOrderId || "未选择"}</p>
						</div>
					</div>
					{verifying || completing ? (
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							{completing ? "正在提交练习结果..." : "正在校验步骤..."}
						</div>
					) : null}
				</>
			)}

			{feedback && (
				<div
					className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
						feedback.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-red-500/40 bg-red-500/10 text-red-500"
					}`}
				>
					{feedback.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
					<span>{feedback.text}</span>
				</div>
			)}

			{completed && (
				<div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
					<div className="flex items-center gap-2 text-emerald-600">
						<Target className="h-5 w-5" />
						<p className="text-lg font-semibold">恭喜完成练习！</p>
					</div>
					<p className="mt-1 text-sm">本关得分：{totalScore} 分（已按“首次错误扣分、正确得分”规则计算）</p>
					<div className="mt-3 flex gap-2">
						<Button variant="outline" onClick={onBack}>
							返回大厅
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
