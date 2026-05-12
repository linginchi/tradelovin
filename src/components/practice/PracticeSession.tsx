"use client";

import { CheckCircle2, Target, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVELS, type PracticeExpected, type PracticeLevel } from "@/lib/practice/levels";

type StepScoreMap = Record<string, number>;
type PracticeLog = {
	levelId: string;
	stepId: string;
	userInput: Record<string, unknown>;
	correct: boolean;
	scoreDelta: number;
	timestamp: string;
};

type CompletePayload = {
	levelId: string;
	finalScore: number;
	stepResults: Array<{ stepId: string; correct: boolean; scoreDelta: number }>;
	logs: PracticeLog[];
};

type Props = {
	levelId: string;
	onBack: () => void;
	onCompleted?: (payload: CompletePayload) => void;
};

const MOCK_STOCK = { symbol: "000001", name: "平安银行" };
const LOG_STORAGE_KEY = "practice:logs:v1";

function getProgressPercent(currentStepIndex: number, stepsLen: number, completed: boolean): number {
	if (stepsLen <= 0) return 0;
	if (completed) return 100;
	return Math.round((currentStepIndex / stepsLen) * 100);
}

function toRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function matchesExpected(expected: PracticeExpected, userInput: unknown): boolean {
	const input = toRecord(userInput);
	switch (expected.type) {
		case "search":
			return String(input.value ?? "").trim() === expected.value;
		case "select":
			return String(input.symbol ?? "") === expected.symbol && String(input.name ?? "") === expected.name;
		case "select_position":
			return String(input.symbol ?? "") === expected.symbol;
		case "quantity":
			return Number(input.value) === expected.value;
		case "position_mode":
			return String(input.value ?? "") === expected.value;
		case "resource_side":
			return String(input.value ?? "") === expected.value;
		case "click_buy":
		case "click_sell":
		case "click_cancel":
		case "click_apply_resource":
		case "confirm":
		case "confirm_cancel":
			return String(input.action ?? "") === expected.type;
		case "view_orders":
			return String(input.view ?? "") === "orders";
		case "select_order":
			return String(input.status ?? "") === expected.status;
		case "order_status":
			return expected.status.includes(String(input.status ?? ""));
		case "price":
			return Number(input.value) === expected.value;
		default:
			return false;
	}
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

	const steps = level?.steps ?? [];
	const currentStep = steps[currentStepIndex] ?? null;
	const progressPercent = getProgressPercent(currentStepIndex, steps.length, completed);
	const hasMockSearchResult = searchInput.includes("000001");
	const persistLog = (entry: PracticeLog) => {
		const merged = [...readStoredLogs(), entry];
		globalThis.localStorage?.setItem(LOG_STORAGE_KEY, JSON.stringify(merged));
	};

	const verifyStep = (userInput: Record<string, unknown>) => {
		if (!currentStep) return;
		const correct = matchesExpected(currentStep.expected, userInput);
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
			setFeedback({ ok: true, text: "步骤正确，+1 分" });
		} else {
			if (previousDelta === undefined) {
				nextStepScores[currentStep.id] = -1;
				scoreDelta = -1;
			}
			nextTotal += scoreDelta;
			setFeedback({ ok: false, text: "输入或操作不正确，请按提示重试" });
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

		if (!correct) return;
		const nextIndex = currentStepIndex + 1;
		if (nextIndex >= steps.length) {
			setCompleted(true);
			console.log("[practice logs]", nextLogs);
			onCompleted?.({
				levelId,
				finalScore: nextTotal,
				stepResults: steps.map((step) => ({
					stepId: step.id,
					correct: true,
					scoreDelta: nextStepScores[step.id] ?? 0,
				})),
				logs: nextLogs,
			});
			return;
		}
		setCurrentStepIndex(nextIndex);
	};

	const tryVerify = (expectedType: PracticeExpected["type"], userInput: Record<string, unknown>) => {
		if (!currentStep) return;
		if (currentStep.expected.type !== expectedType) return;
		verifyStep(userInput);
	};

	const statusText = useMemo(() => {
		if (orderStatus === "pending") return "已报";
		if (orderStatus === "filled") return "成交";
		if (orderStatus === "idle") return "未提交";
		return "未提交";
	}, [orderStatus]);

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
			<div className="flex items-center justify-between gap-2">
				<div>
					<p className="text-lg font-semibold">{level.title}</p>
					<p className="text-xs text-muted-foreground">练习模式：仅演示，不会产生真实交易数据</p>
				</div>
				<Badge variant={practiceMode ? "default" : "secondary"}>{practiceMode ? "练习进行中" : "未开始"}</Badge>
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
					<Button className="mt-3" onClick={() => setPracticeMode(true)}>
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
							onClick={() => {
								setActiveView("trade");
							}}
						>
							交易面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "orders" ? "default" : "outline"}
							onClick={() => {
								setActiveView("orders");
								tryVerify("view_orders", { view: "orders" });
							}}
						>
							委托面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "positions" ? "default" : "outline"}
							onClick={() => setActiveView("positions")}
						>
							持仓面板
						</Button>
						<Button
							size="sm"
							variant={activeView === "resources" ? "default" : "outline"}
							onClick={() => setActiveView("resources")}
						>
							资源面板
						</Button>
					</div>

					<div className="grid gap-3 lg:grid-cols-2">
						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">股票搜索</p>
							<Input
								value={searchInput}
								placeholder="输入代码，如 000001"
								onChange={(e) => {
									setSearchInput(e.target.value);
								}}
								onBlur={() => {
									tryVerify("search", { value: searchInput });
								}}
							/>
							{hasMockSearchResult ? (
								<button
									type="button"
									className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
									onClick={() => {
										setSelectedSymbol(MOCK_STOCK.symbol);
										tryVerify("select", { symbol: MOCK_STOCK.symbol, name: MOCK_STOCK.name });
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
									variant={positionMode === "long" ? "default" : "outline"}
									onClick={() => {
										setPositionMode("long");
										tryVerify("position_mode", { value: "long" });
									}}
								>
									做多
								</Button>
								<Button
									size="sm"
									variant={positionMode === "short" ? "default" : "outline"}
									onClick={() => {
										setPositionMode("short");
										tryVerify("position_mode", { value: "short" });
									}}
								>
									融券做空
								</Button>
							</div>
							<Input
								value={quantityInput}
								placeholder="数量，如 500 / 1000"
								onChange={(e) => {
									setQuantityInput(e.target.value);
								}}
								onBlur={() => {
									tryVerify("quantity", { value: Number(quantityInput) });
								}}
							/>
							<div className="flex gap-2">
								<Button
									disabled={submittingOrder}
									onClick={() => {
										setSubmittingOrder(true);
										setTimeout(() => {
											setSubmittingOrder(false);
											setOrderStatus(Math.random() > 0.5 ? "pending" : "filled");
											tryVerify("click_buy", { action: "click_buy" });
										}, 280);
									}}
								>
									{positionMode === "short" ? "买入平空" : "买入"}
								</Button>
								<Button
									disabled={submittingOrder}
									variant="destructive"
									onClick={() => {
										setSubmittingOrder(true);
										setTimeout(() => {
											setSubmittingOrder(false);
											setOrderStatus(Math.random() > 0.5 ? "pending" : "filled");
											tryVerify("click_sell", { action: "click_sell" });
										}, 280);
									}}
								>
									{positionMode === "short" ? "卖出开空" : "卖出"}
								</Button>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => {
										tryVerify("order_status", { status: orderStatus });
									}}
								>
									检查状态
								</Button>
								<Button variant="outline" onClick={() => tryVerify("confirm", { action: "confirm" })}>
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
								className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
								onClick={() => {
									setSelectedPositionSymbol("000001");
									tryVerify("select_position", { symbol: "000001" });
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
									tryVerify("select_position", { symbol: "000001" });
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
											size="sm"
											variant="outline"
											onClick={() => {
												setSelectedOrderId(order.id);
												tryVerify("select_order", { status: order.status });
											}}
										>
											选择委托
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setMockOrderList((prev) =>
													prev.map((row) => (row.id === order.id ? { ...row, status: "cancelled" } : row)),
												);
												setOrderStatus("pending");
												tryVerify("click_cancel", { action: "click_cancel" });
											}}
										>
											撤单
										</Button>
									</div>
								</div>
							))}
							<div className="flex gap-2">
								<Button
									size="sm"
									variant={resourceSide === "long" ? "default" : "outline"}
									onClick={() => {
										setResourceSide("long");
										tryVerify("resource_side", { value: "long" });
									}}
								>
									多头资源
								</Button>
								<Button
									size="sm"
									variant={resourceSide === "short" ? "default" : "outline"}
									onClick={() => {
										setResourceSide("short");
										tryVerify("resource_side", { value: "short" });
									}}
								>
									空头资源
								</Button>
								<Button
									size="sm"
									onClick={() => {
										setOrderStatus("pending");
										tryVerify("click_apply_resource", { action: "click_apply_resource" });
									}}
								>
									申请资源
								</Button>
							</div>
							<div className="flex gap-2">
								<Button variant="outline" size="sm" onClick={() => tryVerify("confirm_cancel", { action: "confirm_cancel" })}>
									确认撤单成功
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">当前选中委托：{selectedOrderId || "未选择"}</p>
						</div>
					</div>
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
