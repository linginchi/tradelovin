"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PracticeSession } from "@/components/practice/PracticeSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LEVELS } from "@/lib/practice/levels";

type Props = {
	onClose?: () => void;
};

const LOCAL_SCORE_KEY = "practice:score:v1";

export function PracticeLobby({ onClose }: Props) {
	const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
	const [localTotalScore, setLocalTotalScore] = useState(0);
	const levelList = useMemo(() => Object.values(LEVELS), []);

	useEffect(() => {
		const value = Number(globalThis.localStorage?.getItem(LOCAL_SCORE_KEY) ?? "0");
		setLocalTotalScore(Number.isFinite(value) ? value : 0);
	}, []);

	const handleComplete = async (payload: {
		levelId: string;
		finalScore: number;
		stepResults: Array<{ stepId: string; correct: boolean; scoreDelta: number }>;
	}) => {
		const previous = Number(globalThis.localStorage?.getItem(LOCAL_SCORE_KEY) ?? "0");
		const next = previous + payload.finalScore;
		globalThis.localStorage?.setItem(LOCAL_SCORE_KEY, String(next));
		setLocalTotalScore(next);

		try {
			await fetch("/api/practice/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(payload),
			});
		} catch {
			// P1 先本地演示，失败时保持本地积分不丢失
		}
		toast.success(`关卡完成，累计演示积分：${next}`);
	};

	if (activeLevelId) {
		return <PracticeSession levelId={activeLevelId} onBack={() => setActiveLevelId(null)} onCompleted={handleComplete} />;
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-lg font-semibold">练习大厅</p>
					<p className="text-xs text-muted-foreground">按步骤完成模拟操作，不影响真实账户</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="secondary">本地演示积分：{localTotalScore}</Badge>
					{onClose ? (
						<Button variant="outline" size="sm" onClick={onClose}>
							关闭
						</Button>
					) : null}
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{levelList.map((level) => {
					const isReady = level.id === "buy_stock";
					return (
						<div key={level.id} className="rounded-xl border bg-card p-4">
							<div className="flex items-start justify-between gap-2">
								<p className="text-base font-semibold">{level.title}</p>
								<Badge variant={isReady ? "default" : "outline"}>{isReady ? "可练习" : "开发中"}</Badge>
							</div>
							<p className="mt-2 text-xs text-muted-foreground">步骤数：{level.steps.length}</p>
							<Button
								className="mt-4 w-full"
								variant={isReady ? "default" : "outline"}
								onClick={() => {
									if (!isReady) {
										toast.message("该关卡将在 P2 完整开放");
										return;
									}
									setActiveLevelId(level.id);
								}}
							>
								{isReady ? "进入练习" : "敬请期待"}
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
