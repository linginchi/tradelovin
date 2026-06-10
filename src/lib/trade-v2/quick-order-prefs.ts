export type QuickOrderHotkeys = {
	buy: string;
	sell: string;
	close: string;
	qtyUp: string;
	qtyDown: string;
	qtyReset: string;
};

export type QuickOrderPrefs = {
	hotkeys: QuickOrderHotkeys;
	qtyPresets: number[];
};

export const DEFAULT_QUICK_ORDER_PREFS: QuickOrderPrefs = {
	hotkeys: {
		buy: "b",
		sell: "s",
		close: "c",
		qtyUp: "+",
		qtyDown: "-",
		qtyReset: "0",
	},
	qtyPresets: [100, 500, 1000],
};

function normalizeHotkey(value: unknown, fallback: string): string {
	if (typeof value !== "string" || !value.trim()) return fallback;
	return value.trim().slice(0, 1);
}

function normalizeQtyPresets(value: unknown): number[] {
	if (!Array.isArray(value)) return DEFAULT_QUICK_ORDER_PREFS.qtyPresets;
	const parsed = value
		.map((v) => (typeof v === "number" ? Math.trunc(v) : Math.trunc(Number(v))))
		.filter((n) => Number.isInteger(n) && n > 0);
	return parsed.length > 0 ? parsed.slice(0, 6) : DEFAULT_QUICK_ORDER_PREFS.qtyPresets;
}

export function parseQuickOrderPrefs(raw: unknown): QuickOrderPrefs {
	if (!raw || typeof raw !== "object") return DEFAULT_QUICK_ORDER_PREFS;
	const obj = raw as Record<string, unknown>;
	const hotkeysRaw = (obj.hotkeys ?? {}) as Record<string, unknown>;
	return {
		hotkeys: {
			buy: normalizeHotkey(hotkeysRaw.buy, DEFAULT_QUICK_ORDER_PREFS.hotkeys.buy),
			sell: normalizeHotkey(hotkeysRaw.sell, DEFAULT_QUICK_ORDER_PREFS.hotkeys.sell),
			close: normalizeHotkey(hotkeysRaw.close, DEFAULT_QUICK_ORDER_PREFS.hotkeys.close),
			qtyUp: normalizeHotkey(hotkeysRaw.qtyUp, DEFAULT_QUICK_ORDER_PREFS.hotkeys.qtyUp),
			qtyDown: normalizeHotkey(hotkeysRaw.qtyDown, DEFAULT_QUICK_ORDER_PREFS.hotkeys.qtyDown),
			qtyReset: normalizeHotkey(hotkeysRaw.qtyReset, DEFAULT_QUICK_ORDER_PREFS.hotkeys.qtyReset),
		},
		qtyPresets: normalizeQtyPresets(obj.qtyPresets),
	};
}

export function matchHotkey(event: KeyboardEvent, hotkey: string): boolean {
	if (!hotkey) return false;
	if (hotkey === "+") return event.key === "+" || event.key === "=";
	if (hotkey === "-") return event.key === "-" || event.key === "_";
	return event.key.toLowerCase() === hotkey.toLowerCase();
}
