"use client";

import {
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";

type Props = {
	children: ReactNode;
	/** Extra margin so content starts loading before it enters the viewport. */
	rootMargin?: string;
	/** Placeholder min-height to reduce layout shift before children mount. */
	minHeight?: number;
	fallback?: ReactNode;
};

/**
 * Mounts `children` only after the placeholder intersects the viewport.
 * Pair with `next/dynamic` to defer downloading heavy chunks until needed.
 */
export function LazyWhenVisible({
	children,
	rootMargin = "160px",
	minHeight = 120,
	fallback = null,
}: Props) {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el || visible) return;

		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin, threshold: 0.01 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [visible, rootMargin]);

	return (
		<div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
			{visible ? children : fallback}
		</div>
	);
}
