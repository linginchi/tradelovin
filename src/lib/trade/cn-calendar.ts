/**
 * 以上海时区定义“今日”范围，避免自然日偏差。
 */
export function getChinaTodayRangeIso(now = new Date()): { start: string; end: string } {
	const locale = "en-CA";
	const day = new Intl.DateTimeFormat(locale, {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);

	const startLocal = `${day}T00:00:00+08:00`;
	const endDate = new Date(new Date(startLocal).getTime() + 24 * 60 * 60 * 1000);
	const endDay = new Intl.DateTimeFormat(locale, {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(endDate);
	const endLocal = `${endDay}T00:00:00+08:00`;
	return {
		start: new Date(startLocal).toISOString(),
		end: new Date(endLocal).toISOString(),
	};
}
