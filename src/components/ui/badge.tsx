import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary/15 text-primary-foreground dark:bg-primary/25",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground",
				outline: "border-border/80 text-foreground",
				success:
					"border-transparent bg-emerald-500/15 text-emerald-200 dark:bg-emerald-500/20",
				warning:
					"border-transparent bg-amber-500/15 text-amber-100 dark:bg-amber-500/20",
				muted: "border-transparent bg-muted/80 text-muted-foreground",
				online:
					"border-transparent bg-violet-500/15 text-violet-200 dark:bg-violet-500/20",
				offline:
					"border-transparent bg-emerald-500/15 text-emerald-200 dark:bg-emerald-500/20",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export type BadgeProps = React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
