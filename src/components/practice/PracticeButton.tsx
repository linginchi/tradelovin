"use client";

import { Gamepad2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PracticeLobby } from "@/components/practice/PracticeLobby";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type MembershipResponse = {
	success?: boolean;
	data?: {
		plan?: string;
	};
};

function canShowPracticeByPlan(plan: string | null): boolean {
	if (!plan) return true;
	return ["T0_trial", "T0_paid", "T1", "T2", "T3"].includes(plan);
}

export function PracticeButton() {
	const [open, setOpen] = useState(false);
	const [plan, setPlan] = useState<string | null>(null);

	useEffect(() => {
		const loadMembership = async () => {
			try {
				const res = await fetch("/api/membership/current", { credentials: "include" });
				const json = (await res.json()) as MembershipResponse;
				setPlan(json?.data?.plan ?? null);
			} catch {
				setPlan(null);
			}
		};
		void loadMembership();
	}, []);

	const canShow = useMemo(() => canShowPracticeByPlan(plan), [plan]);
	if (!canShow) return null;

	return (
		<>
			<div className="flex flex-col items-end gap-0.5">
				<Button
					size="sm"
					className="whitespace-nowrap rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-red-500 px-4 py-2 font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-red-500/35"
					onClick={() => setOpen(true)}
				>
					<Gamepad2 className="mr-1.5 h-4 w-4" />
					🎮 操作练习
				</Button>
				<span className="text-[11px] text-muted-foreground">不计入考核、不扣额度</span>
			</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="h-[92vh] w-[96vw] max-w-5xl overflow-y-auto p-0 sm:h-[88vh] sm:max-w-6xl">
					<div className="min-h-full bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 p-4 text-slate-100 sm:p-6">
						<DialogHeader>
							<DialogTitle>操作练习模式</DialogTitle>
							<DialogDescription className="text-slate-300">
								教学引导，不扣减真实额度，不计入考核，不产生真实交易持仓
							</DialogDescription>
						</DialogHeader>
						<div className="mt-4">
							<PracticeLobby onClose={() => setOpen(false)} />
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
