"use client";

type StageInfo = {
	key: string;
	title: string;
	description: string;
	icon: string;
};

type NextStageInfo = StageInfo & {
	requirementHint?: string;
};

type Props = {
	currentStage: StageInfo | null;
	nextStage: NextStageInfo | null;
	totalScore: number;
	completedCount: number;
};

export function StageCard({ currentStage, nextStage, totalScore, completedCount }: Props) {
	const stage = currentStage ?? {
		key: "cub",
		title: "初生幼豹",
		description: "初入练习场，稳扎稳打。",
		icon: "🐆",
	};

	return (
		<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-3">
					<div className="text-3xl">{stage.icon}</div>
					<div>
						<p className="text-sm text-muted-foreground">当前豹阶段</p>
						<p className="text-lg font-semibold">{stage.title}</p>
						<p className="text-xs text-muted-foreground">{stage.description}</p>
					</div>
				</div>
				<div className="text-right text-xs text-muted-foreground">
					<p>总积分：{totalScore}</p>
					<p>完成关卡：{completedCount}</p>
				</div>
			</div>
			<div className="mt-3 rounded-md border bg-background/60 p-2 text-xs">
				{nextStage ? (
					<>
						<p className="font-medium">
							下一阶段：{nextStage.icon} {nextStage.title}
						</p>
						<p className="text-muted-foreground">{nextStage.requirementHint ?? "继续练习即可解锁"}</p>
					</>
				) : (
					<p className="font-medium text-emerald-600">已达到最高阶段：传奇豹尊</p>
				)}
			</div>
		</div>
	);
}
