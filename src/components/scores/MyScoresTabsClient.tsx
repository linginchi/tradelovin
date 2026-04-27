"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SkillRadarPanel = dynamic(() => import("@/components/scores/SkillRadarPanel"), {
	loading: () => (
		<div
			className="bg-muted/30 flex h-52 w-full max-w-md animate-pulse items-center justify-center rounded-xl text-xs text-muted-foreground"
			aria-hidden
		>
			…
		</div>
	),
});

type ExamRow = {
	name: string;
	score: number;
	grade: string;
	date: string;
};

export default function MyScoresTabsClient({
	axes,
	exams,
	profileTitle,
	profileHint,
	examTitle,
	radarLabel,
}: {
	axes: Array<{ key: string; value: number }>;
	exams: ExamRow[];
	profileTitle: string;
	profileHint: string;
	examTitle: string;
	radarLabel: string;
}) {
	const [radarReady, setRadarReady] = useState(false);

	return (
		<Tabs
			defaultValue="exams"
			className="w-full"
			onValueChange={(v) => {
				if (v === "profile") setRadarReady(true);
			}}
		>
			<TabsList className="w-full justify-start overflow-x-auto">
				<TabsTrigger value="exams">{examTitle}</TabsTrigger>
				<TabsTrigger value="profile">{profileTitle}</TabsTrigger>
			</TabsList>

			<TabsContent value="exams" className="space-y-3">
				<ul className="mt-2 space-y-3">
					{exams.map((row) => (
						<li
							key={row.name}
							className="border-border/60 flex flex-col gap-2 rounded-xl border bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div>
								<p className="text-sm font-medium">{row.name}</p>
								<p className="text-muted-foreground text-xs">{row.date}</p>
							</div>
							<div className="flex items-baseline gap-3 sm:text-right">
								<span className="text-primary font-mono text-lg font-semibold tabular-nums">
									{row.score}
								</span>
								<span className="text-cyan-300/90 text-xs font-medium">{row.grade}</span>
							</div>
						</li>
					))}
				</ul>
			</TabsContent>

			<TabsContent value="profile">
				<p className="text-muted-foreground mt-2 text-xs md:text-sm">{profileHint}</p>
				<div className="mt-6">{radarReady ? <SkillRadarPanel axes={axes} label={radarLabel} /> : null}</div>
			</TabsContent>
		</Tabs>
	);
}
