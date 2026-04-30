"use client";

export default function SkillRadarPanel({
	axes,
	label,
	tone = "teal",
	compact = false,
}: {
	axes: Array<{ key: string; value: number }>;
	label: string;
	tone?: "teal" | "violet" | "sky" | "amber";
	compact?: boolean;
}) {
	const n = axes.length;
	const center = 50;
	const maxR = 38;
	const points = axes
		.map((axis, i) => {
			const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
			const r = (Math.max(0, Math.min(axis.value, 100)) / 100) * maxR;
			const x = center + r * Math.cos(angle);
			const y = center + r * Math.sin(angle);
			return `${x},${y}`;
		})
		.join(" ");

	const gridRings = [0.25, 0.5, 0.75, 1].map((t) => (
		<circle
			key={t}
			cx={center}
			cy={center}
			r={maxR * t}
			fill="none"
			className="stroke-border/60"
			strokeWidth={0.5}
		/>
	));

	const spokes = axes.map((_, i) => {
		const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
		const x2 = center + maxR * Math.cos(angle);
		const y2 = center + maxR * Math.sin(angle);
		return (
			<line
				key={i}
				x1={center}
				y1={center}
				x2={x2}
				y2={y2}
				className="stroke-border/50"
				strokeWidth={0.5}
			/>
		);
	});

	const palette =
		tone === "violet"
			? {
					shapeFill: "oklch(0.7 0.14 305 / 0.32)",
					shapeStroke: "oklch(0.76 0.12 305)",
					valueText: "text-violet-300",
					barBg: "from-violet-600/80 to-violet-400/90",
				}
			: tone === "sky"
				? {
						shapeFill: "oklch(0.8 0.09 240 / 0.32)",
						shapeStroke: "oklch(0.82 0.09 240)",
						valueText: "text-sky-300",
						barBg: "from-sky-600/80 to-sky-400/90",
					}
				: tone === "amber"
					? {
							shapeFill: "oklch(0.83 0.1 70 / 0.35)",
							shapeStroke: "oklch(0.84 0.11 70)",
							valueText: "text-amber-300",
							barBg: "from-amber-600/80 to-amber-400/90",
						}
					: {
							shapeFill: "oklch(0.75 0.14 195 / 0.35)",
							shapeStroke: "oklch(0.78 0.14 195)",
							valueText: "text-cyan-300",
							barBg: "from-cyan-600/80 to-cyan-400/90",
						};

	return (
		<div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:gap-8">
			<svg
				viewBox="0 0 100 100"
				className={compact ? "size-36 shrink-0 md:size-40" : "size-44 shrink-0 md:size-52"}
				role="img"
				aria-label={label}
			>
				{gridRings}
				{spokes}
				<polygon
					points={points}
					fill={palette.shapeFill}
					stroke={palette.shapeStroke}
					strokeWidth={1}
				/>
			</svg>
			<ul className="grid w-full max-w-sm gap-2 text-sm">
				{axes.map((axis) => (
					<li key={axis.key}>
						<div className="mb-1 flex justify-between text-xs">
							<span className="text-muted-foreground">{axis.key}</span>
							<span className={`font-mono tabular-nums ${palette.valueText}`}>{axis.value.toFixed(2)}</span>
						</div>
						<div className="bg-muted/40 h-2 overflow-hidden rounded-full">
							<div
								className={`h-full rounded-full bg-linear-to-r ${palette.barBg}`}
								style={{ width: `${Math.max(0, Math.min(axis.value, 100))}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
