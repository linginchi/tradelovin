"use client";

import { useEffect, useState } from "react";

type Props = {
	targetKey: string | null;
	enabled: boolean;
};

type RectState = { top: number; left: number; width: number; height: number } | null;

export function PracticeTargetHighlighter({ targetKey, enabled }: Props) {
	const [rect, setRect] = useState<RectState>(null);

	useEffect(() => {
		if (!enabled || !targetKey) return;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			if (cancelled) return;
			const target = document.querySelector<HTMLElement>(`[data-practice-target="${targetKey}"]`);
			if (!target) {
				console.warn("[practice] target not found:", targetKey);
				setRect(null);
				return;
			}
			target.scrollIntoView({ behavior: "smooth", block: "center" });
			const box = target.getBoundingClientRect();
			setRect({
				top: Math.max(0, box.top - 6),
				left: Math.max(0, box.left - 6),
				width: box.width + 12,
				height: box.height + 12,
			});
		}, 80);

		const onResize = () => {
			const target = document.querySelector<HTMLElement>(`[data-practice-target="${targetKey}"]`);
			if (!target) return;
			const box = target.getBoundingClientRect();
			setRect({
				top: Math.max(0, box.top - 6),
				left: Math.max(0, box.left - 6),
				width: box.width + 12,
				height: box.height + 12,
			});
		};
		window.addEventListener("resize", onResize);
		window.addEventListener("scroll", onResize, true);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("scroll", onResize, true);
		};
	}, [enabled, targetKey]);

	if (!enabled || !targetKey || !rect) return null;

	return (
		<div className="pointer-events-none fixed inset-0 z-[70]">
			<div
				className="absolute text-2xl"
				style={{
					top: Math.max(0, rect.top - 28),
					left: Math.max(0, rect.left + rect.width - 12),
					animation: "practice-paw-bounce 0.9s ease-in-out infinite",
				}}
			>
				🐾
			</div>
			<style jsx>{`
				@keyframes practice-paw-bounce {
					0%,
					100% {
						transform: translateY(0);
					}
					50% {
						transform: translateY(-6px);
					}
				}
			`}</style>
		</div>
	);
}
