"use client";

import { CheckCircle2, Target, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVELS, type PracticeLevel } from "@/lib/practice/levels";

type StepScoreMap = Record<string, number>;

type CompletePayload = {
	levelId: string;
	finalScore: number;
	stepResults: Array<{ stepId: string; correct: boolean; scoreDelta: number }>;
};

type Props = {
	levelId: string;
	onBack: () => void;
	onCompleted?: (payload: CompletePayload) => void;
};

const MOCK_STOCK = { symbol: "000001", name: "平安银行" };

function getProgressPercent(currentStepIndex: number, stepsLen: number, completed: boolean): number {
	if (stepsLen <= 0) return 0;
	if (completed) return 100;
	return Math.round((currentStepIndex / stepsLen) * 100);
}

export function PracticeSession({ levelId, onBack, onCompleted }: Props) {
	const level: PracticeLevel | null = LEVELS[levelId] ?? null;
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [stepScores, setStepScores] = useState<StepScoreMap>({});
	const [totalScore, setTotalScore] = useState(0);
	const [completed, setCompleted] = useState(false);
	const [practiceMode, setPracticeMode] = useState(false);
	const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

	const [searchInput, setSearchInput] = useState("");
	const [selectedSymbol, setSelectedSymbol] = useState("");
	const [quantityInput, setQuantityInput] = useState("");
	const [orderStatus, setOrderStatus] = useState<"pending" | "filled" | "idle">("idle");
	const [submittingOrder, setSubmittingOrder] = useState(false);

	const steps = level?.steps ?? [];
	const currentStep = steps[currentStepIndex] ?? null;
	const progressPercent = getProgressPercent(currentStepIndex, steps.length, completed);
	const hasMockSearchResult = searchInput.includes("000001");

	const ensurePenaltyOnce = (stepId: string) => {
		if (stepScores[stepId] !== undefined) return;
		setStepScores((prev) => ({ ...prev, [stepId]: -1 }));
		setTotalScore((prev) => prev - 1);
	};

	const markStepSuccess = (stepId: string) => {
		const prevDelta = stepScores[stepId];
		if (prevDelta === undefined) {
			setStepScores((prev) => ({ ...prev, [stepId]: 1 }));
			setTotalScore((prev) => prev + 1);
		} else if (prevDelta < 0) {
			setStepScores((prev) => ({ ...prev, [stepId]: 0 }));
			setTotalScore((prev) => prev + 1);
		}

		const nextIndex = currentStepIndex + 1;
		if (nextIndex >= steps.length) {
			setCompleted(true);
			onCompleted?.({
				levelId,
				finalScore: totalScore + (prevDelta === undefined ? 1 : prevDelta < 0 ? 1 : 0),
				stepResults: steps.map((step) => ({
					stepId: step.id,
					correct: true,
					scoreDelta: step.id === stepId ? (prevDelta === undefined ? 1 : prevDelta < 0 ? 0 : prevDelta) : (stepScores[step.id] ?? 0),
				})),
			});
			return;
		}
		setCurrentStepIndex(nextIndex);
	};

	const verifyStep = (userInput: unknown) => {
		if (!currentStep) return;
		let correct = false;
		switch (currentStep.id) {
			case "search":
				correct = String(userInput ?? "").trim() === "000001";
				break;
			case "select":
				correct = String(userInput ?? "") === "000001";
				break;
			case "quantity":
				correct = Number(userInput) === 1000;
				break;
			case "buy":
				correct = userInput === "click_buy";
				break;
			case "confirm":
				correct = userInput === "confirm_sent" && (orderStatus === "pending" || orderStatus === "filled");
				break;
			default:
				correct = false;
		}

		if (correct) {
			setFeedback({ ok: true, text: "步骤正确，+1 分" });
			markStepSuccess(currentStep.id);
			return;
		}

		ensurePenaltyOnce(currentStep.id);
		setFeedback({ ok: false, text: "输入或操作不正确，请按提示重试" });
	};

	const statusText = useMemo(() => {
		if (orderStatus === "pending") return "已报";
		if (orderStatus === "filled") return "成交";
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
				进度：{completed ? steps.length : currentStepIndex}/{steps.length} | 总分：{totalScore}
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

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">股票搜索</p>
							<Input
								value={searchInput}
								placeholder="输入代码，如 000001"
								onChange={(e) => {
									setSearchInput(e.target.value);
								}}
								onBlur={() => {
									if (currentStep.id === "search") verifyStep(searchInput);
								}}
							/>
							{hasMockSearchResult ? (
								<button
									type="button"
									className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
									onClick={() => {
										setSelectedSymbol(MOCK_STOCK.symbol);
										if (currentStep.id === "select") verifyStep(MOCK_STOCK.symbol);
									}}
								>
									{MOCK_STOCK.symbol} - {MOCK_STOCK.name}
								</button>
							) : (
								<p className="text-xs text-muted-foreground">输入 000001 可出现模拟搜索结果</p>
							)}
						</div>

						<div className="space-y-2 rounded-lg border p-3">
							<p className="text-sm font-medium">买入参数</p>
							<p className="text-xs text-muted-foreground">已选股票：{selectedSymbol || "未选择"}</p>
							<Input
								value={quantityInput}
								placeholder="买入数量，如 1000"
								onChange={(e) => {
									setQuantityInput(e.target.value);
								}}
								onBlur={() => {
									if (currentStep.id === "quantity") verifyStep(quantityInput);
								}}
							/>
							<div className="flex gap-2">
								<Button
									disabled={submittingOrder}
									onClick={() => {
										setSubmittingOrder(true);
										setTimeout(() => {
											setSubmittingOrder(false);
											setOrderStatus("pending");
											if (currentStep.id === "buy") verifyStep("click_buy");
										}, 280);
									}}
								>
									买入
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										if (currentStep.id === "confirm") verifyStep("confirm_sent");
									}}
								>
									确认委托已发送
								</Button>
							</div>
							<div className="rounded-md bg-muted p-2 text-xs">
								<p>模拟委托状态：{statusText}</p>
							</div>
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
