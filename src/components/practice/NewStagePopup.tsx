"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type StageInfo = {
	key: string;
	title: string;
	description: string;
	icon: string;
};

type Props = {
	stage: StageInfo | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function NewStagePopup({ stage, open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>阶段解锁</DialogTitle>
					<DialogDescription>恭喜你完成成长突破！</DialogDescription>
				</DialogHeader>
				<div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
					<p className="text-4xl">{stage?.icon ?? "🐆"}</p>
					<p className="mt-2 text-xl font-semibold">恭喜！你已成长为【{stage?.title ?? "新阶段"}】</p>
					<p className="mt-1 text-sm text-muted-foreground">{stage?.description ?? "继续前进，解锁更高阶段"}</p>
				</div>
				<div className="flex justify-end">
					<Button onClick={() => onOpenChange(false)}>继续训练</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
