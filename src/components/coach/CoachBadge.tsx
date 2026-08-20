import { Badge } from "@/components/ui/badge";

export function CoachBadge({ className }: { className?: string }) {
	return (
		<Badge
			className={`border-amber-400/60 bg-amber-500/15 font-semibold text-amber-200 ${className ?? ""}`}
		>
			P3 · 金钱豹教练
		</Badge>
	);
}
