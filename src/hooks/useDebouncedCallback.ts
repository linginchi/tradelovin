"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends unknown[]>(
	callback: (...args: T) => void | Promise<void>,
	delayMs: number,
) {
	const timerRef = useRef<number | null>(null);
	const callbackRef = useRef(callback);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
		};
	}, []);

	return useCallback(
		(...args: T) => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
			timerRef.current = window.setTimeout(() => {
				void callbackRef.current(...args);
			}, delayMs);
		},
		[delayMs],
	);
}
