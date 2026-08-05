/**
 * Client-safe popularity formatting (no Node built-ins).
 * Keep body in sync with formatMarketingViewCount in marketing-popularity.ts.
 */
export function formatMarketingViewCount(count: number): string {
	const n = Math.max(0, Math.floor(Number(count) || 0));
	if (n >= 10_000) {
		const wan = n / 10_000;
		const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(1);
		return `${text}万`;
	}
	if (n >= 1_000) {
		const k = n / 1_000;
		const text = Number.isInteger(k) ? String(k) : k.toFixed(1);
		return `${text}K`;
	}
	return String(n);
}
