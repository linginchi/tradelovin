/** 以香港日历日（Asia/Hong_Kong）作为「今日」的 UTC 起止，用于委托/成交筛选。 */
export function getHongKongTodayRangeIso(): { start: string; end: string } {
	const now = new Date();
	const ymd = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Hong_Kong",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const start = new Date(`${ymd}T00:00:00+08:00`);
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	return { start: start.toISOString(), end: end.toISOString() };
}
