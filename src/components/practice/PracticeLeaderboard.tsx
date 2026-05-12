"use client";

import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LeaderboardEntry = {
	rank: number;
	name: string;
	totalScore: number;
};

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function PracticeLeaderboard({ open, onOpenChange }: Props) {
	const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) return;
		const load = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/practice/leaderboard", { credentials: "include" });
				const json = (await res.json()) as {
					success?: boolean;
					entries?: Array<{ rank?: unknown; name?: unknown; totalScore?: unknown }>;
				};
				const data = (json.entries ?? []).map((item) => ({
					rank: Number(item.rank ?? 0),
					name: String(item.name ?? "匿名用户"),
					totalScore: Number(item.totalScore ?? 0),
				}));
				setEntries(data);
			} catch {
				setEntries([]);
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Trophy className="h-5 w-5 text-amber-500" />
						练习积分排行榜
					</DialogTitle>
					<DialogDescription>仅显示积分排名前 20 名</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					{loading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
					{!loading && entries.length === 0 ? <p className="text-sm text-muted-foreground">暂无排行数据</p> : null}
					{entries.map((entry) => (
						<div key={`${entry.rank}-${entry.name}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
							<span>
								#{entry.rank} {entry.name}
							</span>
							<span className="font-semibold">{entry.totalScore}</span>
						</div>
					))}
				</div>
				<div className="flex justify-end">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						关闭
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
