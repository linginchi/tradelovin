"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { NewStagePopup } from "@/components/practice/NewStagePopup";
import { PracticeLeaderboard } from "@/components/practice/PracticeLeaderboard";
import { PracticeSession } from "@/components/practice/PracticeSession";
import { StageCard } from "@/components/practice/StageCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LEVELS } from "@/lib/practice/levels";

type Props = {
	onClose?: () => void;
};

const LOCAL_SCORE_KEY = "practice:score:v1";
const STATS_MOCK_KEY = "practice:stats:mock:v1";
const LAST_STAGE_KEY = "practice:last-stage:v1";

type StageInfo = {
	key: string;
	title: string;
	description: string;
	icon: string;
};

type StatsResponse = {
	totalScore: number;
	completedLevels: Array<{ levelId: string; bestScore: number; completedAt: string }>;
	currentStage?: StageInfo | null;
	nextStage?: (StageInfo & { requirementHint?: string }) | null;
};

function getDefaultStats(): StatsResponse {
	return {
		totalScore: 0,
		completedLevels: [],
		currentStage: { key: "cub", title: "初生幼豹", description: "初入练习场，稳扎稳打。", icon: "🐆" },
		nextStage: { key: "young", title: "青年豹", description: "锐意进取，动作渐稳。", icon: "🐆", requirementHint: "再完成 2 个关卡或再得 30 分" },
	};
}

export function PracticeLobby({ onClose }: Props) {
	const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
	const [stats, setStats] = useState<StatsResponse>(getDefaultStats());
	const [leaderboardOpen, setLeaderboardOpen] = useState(false);
	const [newStage, setNewStage] = useState<StageInfo | null>(null);
	const [newStageOpen, setNewStageOpen] = useState(false);
	const levelList = useMemo(() => Object.values(LEVELS), []);

	useEffect(() => {
		const value = Number(globalThis.localStorage?.getItem(LOCAL_SCORE_KEY) ?? "0");
		setStats((prev) => ({ ...prev, totalScore: Number.isFinite(value) ? value : 0 }));

		const loadStats = async () => {
			try {
				const res = await fetch("/api/practice/stats", { credentials: "include" });
				if (!res.ok) throw new Error("stats api unavailable");
				const json = (await res.json()) as {
					totalScore?: unknown;
					completedLevels?: unknown;
					currentStage?: unknown;
					nextStage?: unknown;
				};
				const next: StatsResponse = {
					totalScore: Number(json.totalScore ?? 0),
					completedLevels: Array.isArray(json.completedLevels)
						? (json.completedLevels as StatsResponse["completedLevels"])
						: [],
					currentStage:
						json.currentStage && typeof json.currentStage === "object"
							? (json.currentStage as StageInfo)
							: getDefaultStats().currentStage,
					nextStage:
						json.nextStage && typeof json.nextStage === "object"
							? (json.nextStage as NonNullable<StatsResponse["nextStage"]>)
							: getDefaultStats().nextStage,
				};
				setStats(next);
				if (next.currentStage?.key) {
					globalThis.localStorage?.setItem(LAST_STAGE_KEY, next.currentStage.key);
				}
			} catch {
				const mock = Number(globalThis.localStorage?.getItem(STATS_MOCK_KEY) ?? "0");
				if (Number.isFinite(mock) && mock > 0) {
					setStats((prev) => ({ ...prev, totalScore: mock }));
				}
			}
		};
		void loadStats();
	}, []);

	const handleComplete = async (payload: {
		levelId: string;
		finalScore: number;
		stepResults: Array<{ stepId: string; correct: boolean; scoreDelta: number }>;
		logs: Array<{
			levelId: string;
			stepId: string;
			userInput: Record<string, unknown>;
			correct: boolean;
			scoreDelta: number;
			timestamp: string;
		}>;
		newTotalScore?: number;
	}) => {
		const previous = Number(globalThis.localStorage?.getItem(LOCAL_SCORE_KEY) ?? "0");
		const fromServer =
			typeof payload.newTotalScore === "number" && Number.isFinite(payload.newTotalScore)
				? payload.newTotalScore
				: null;
		const next = fromServer ?? previous + payload.finalScore;
		globalThis.localStorage?.setItem(LOCAL_SCORE_KEY, String(next));
		globalThis.localStorage?.setItem(STATS_MOCK_KEY, String(next));
		setStats((prev) => ({ ...prev, totalScore: next }));
		if (payload.newStage) {
			setNewStage(payload.newStage);
			setNewStageOpen(true);
			globalThis.localStorage?.setItem(LAST_STAGE_KEY, payload.newStage.key);
		}

		try {
			const res = await fetch("/api/practice/stats", { credentials: "include" });
			if (res.ok) {
				const json = (await res.json()) as {
					totalScore?: unknown;
					completedLevels?: unknown;
					currentStage?: unknown;
					nextStage?: unknown;
				};
				setStats((prev) => ({
					totalScore: Number(json.totalScore ?? next),
					completedLevels: Array.isArray(json.completedLevels)
						? (json.completedLevels as StatsResponse["completedLevels"])
						: [],
					currentStage:
						json.currentStage && typeof json.currentStage === "object"
							? (json.currentStage as StageInfo)
							: prev.currentStage ?? getDefaultStats().currentStage,
					nextStage:
						json.nextStage && typeof json.nextStage === "object"
							? (json.nextStage as NonNullable<StatsResponse["nextStage"]>)
							: prev.nextStage ?? getDefaultStats().nextStage,
				}));
			}
		} catch {
			// 网络异常时保留本地分数
		}
		toast.success(`关卡完成，累计演示积分：${next}`);
	};

	if (activeLevelId) {
		return <PracticeSession levelId={activeLevelId} onBack={() => setActiveLevelId(null)} onCompleted={handleComplete} />;
	}

	const completedLevelIds = new Set(stats.completedLevels.map((item) => item.levelId));

	return (
		<div className="space-y-4">
			<PracticeLeaderboard open={leaderboardOpen} onOpenChange={setLeaderboardOpen} />
			<NewStagePopup stage={newStage} open={newStageOpen} onOpenChange={setNewStageOpen} />

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-lg font-semibold">练习大厅</p>
					<p className="text-xs text-muted-foreground">按步骤完成模拟操作，不影响真实账户</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="secondary">我的总积分：{stats.totalScore}</Badge>
					<Button variant="outline" size="sm" onClick={() => setLeaderboardOpen(true)}>
						积分排行榜
					</Button>
					{onClose ? (
						<Button variant="outline" size="sm" onClick={onClose}>
							关闭
						</Button>
					) : null}
				</div>
			</div>

			<StageCard
				currentStage={stats.currentStage ?? null}
				nextStage={stats.nextStage ?? null}
				totalScore={stats.totalScore}
				completedCount={stats.completedLevels.length}
			/>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{levelList.map((level) => {
					return (
						<div key={level.id} className="rounded-xl border bg-card p-4">
							<div className="flex items-start justify-between gap-2">
								<p className="text-base font-semibold">{level.title}</p>
								<Badge variant={completedLevelIds.has(level.id) ? "default" : "outline"}>
									{completedLevelIds.has(level.id) ? "已完成" : "可练习"}
								</Badge>
							</div>
							<p className="mt-2 text-xs text-muted-foreground">步骤数：{level.steps.length}</p>
							<Button
								className="mt-4 w-full"
								variant="default"
								onClick={() => setActiveLevelId(level.id)}
							>
								进入练习
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
