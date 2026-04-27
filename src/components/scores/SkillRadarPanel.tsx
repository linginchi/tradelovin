"use client";

export default function SkillRadarPanel({
	axes,
	label,
}: {
	axes: Array<{ key: string; value: number }>;
	label: string;
}) {
	const n = axes.length;
	const center = 50;
	const maxR = 38;
	const points = axes
		.map((axis, i) => {
			const angle = (-Math.PI / 2 + (2 * Math.PI * i) / n) as number;
			const r = (axis.value / 100) * maxR;
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

	return (
		<div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:gap-8">
			<svg
				viewBox="0 0 100 100"
				className="size-44 shrink-0 text-cyan-400/90 md:size-52"
				role="img"
				aria-label={label}
			>
				{gridRings}
				{spokes}
				<polygon
					points={points}
					fill="oklch(0.75 0.14 195 / 0.35)"
					stroke="oklch(0.78 0.14 195)"
					strokeWidth={1}
				/>
			</svg>
			<ul className="grid w-full max-w-sm gap-2 text-sm">
				{axes.map((axis) => (
					<li key={axis.key}>
						<div className="mb-1 flex justify-between text-xs">
							<span className="text-muted-foreground">{axis.key}</span>
							<span className="font-mono tabular-nums text-cyan-300">{axis.value}</span>
						</div>
						<div className="bg-muted/40 h-2 overflow-hidden rounded-full">
							<div
								className="h-full rounded-full bg-linear-to-r from-cyan-600/80 to-cyan-400/90"
								style={{ width: `${axis.value}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
