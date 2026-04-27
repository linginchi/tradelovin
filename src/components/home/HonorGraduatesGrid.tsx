"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export type HonorGraduate = {
	name: string;
	destination: string;
	role: string;
	achievement: string;
};

export default function HonorGraduatesGrid({
	honorGraduates,
}: {
	honorGraduates: HonorGraduate[];
}) {
	const t = useTranslations("Home");

	return (
		<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{honorGraduates.map((g, i) => (
				<motion.li
					key={g.name}
					initial={{ opacity: 0, y: 10 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4, delay: i * 0.05 }}
					className="group border-border/70 bg-card/35 hover:border-cyan-500/35 relative overflow-hidden rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.25),0_18px_40px_-24px_oklch(0.55_0.18_195/0.35)]"
				>
					<div
						className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
						aria-hidden
					>
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,oklch(0.55_0.18_195/0.12),transparent_55%)]" />
					</div>
					<div className="relative flex gap-4">
						<div
							className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-linear-to-br from-cyan-500/25 to-transparent text-lg font-bold text-cyan-100 shadow-inner"
							aria-hidden
						>
							{t("honorInitial")}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold">{g.name}</p>
							<p className="text-muted-foreground mt-0.5 text-xs">{g.destination}</p>
							<p className="text-cyan-200/90 mt-2 text-xs font-medium">{g.role}</p>
							<p className="text-muted-foreground mt-2 text-xs leading-relaxed">
								{g.achievement}
							</p>
						</div>
					</div>
				</motion.li>
			))}
		</ul>
	);
}
