"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type NavDropdownItem = {
	label: string;
	href?: string;
};

type Props = {
	label: string;
	items?: NavDropdownItem[];
	/** Text shown when there are no real destinations yet. */
	comingSoonLabel: string;
	className?: string;
};

/** Lightweight, dependency-free nav dropdown: click to toggle, Esc / outside-click to close. */
export function NavDropdown({ label, items, comingSoonLabel, className }: Props) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				close();
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, close]);

	const hasItems = !!items && items.length > 0;

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
					open ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
				<ChevronDown
					className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
					aria-hidden
				/>
			</button>

			{open ? (
				<div
					role="menu"
					aria-label={label}
					className="border-border/80 bg-popover absolute right-0 z-50 mt-2 min-w-[11rem] rounded-xl border p-1.5 shadow-lg ring-1 ring-foreground/10"
				>
					{hasItems ? (
						items!.map((item) =>
							item.href ? (
								<Link
									key={item.label}
									href={item.href}
									role="menuitem"
									onClick={close}
									className="text-muted-foreground hover:bg-white/5 hover:text-foreground flex rounded-lg px-3 py-2 text-sm transition-colors"
								>
									{item.label}
								</Link>
							) : (
								<span
									key={item.label}
									role="menuitem"
									aria-disabled
									className="text-muted-foreground/60 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
								>
									{item.label}
									<span className="text-[10px] font-medium text-amber-400/70">
										{comingSoonLabel}
									</span>
								</span>
							),
						)
					) : (
						<p className="text-muted-foreground/70 px-3 py-2 text-sm">{comingSoonLabel}</p>
					)}
				</div>
			) : null}
		</div>
	);
}
