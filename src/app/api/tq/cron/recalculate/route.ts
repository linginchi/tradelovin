import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { recalculateTqAllUsers } from "@/lib/tq/engine";
import { isJointTradingDay } from "@/lib/trade/market-calendar";

export const runtime = "nodejs";

function getHongKongDateParts(now = new Date()) {
	const dtf = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Hong_Kong",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		weekday: "short",
	});
	const parts = dtf.formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
	const y = get("year");
	const m = get("month");
	const d = get("day");
	return {
		ymd: `${y}${m}${d}`,
		weekday: get("weekday"),
		hour: Number(get("hour") || 0),
		minute: Number(get("minute") || 0),
	};
}

async function shouldRunToday() {
	const hk = getHongKongDateParts();
	const targetHour = Number(process.env.TQ_CRON_TARGET_HOUR ?? 16);
	if (hk.weekday === "Sat" || hk.weekday === "Sun") {
		return { allowed: false, reason: "周末非交易日", ymd: hk.ymd };
	}
	if (hk.hour < targetHour) {
		return { allowed: false, reason: `未到香港时间 ${String(targetHour).padStart(2, "0")}:00`, ymd: hk.ymd };
	}
	const { sseOpen, xhkgOpen } = await isJointTradingDay(hk.ymd);
	if (!sseOpen || !xhkgOpen) {
		return {
			allowed: false,
			reason: `交易日校验未通过（SSE=${sseOpen ? "open" : "closed"}, XHKG=${xhkgOpen ? "open" : "closed"}）`,
			ymd: hk.ymd,
		};
	}
	return { allowed: true, reason: "", ymd: hk.ymd };
}

export async function POST(request: Request) {
	const expected = process.env.TQ_CRON_API_KEY;
	if (!expected) {
		return NextResponse.json({ success: false, error: "TQ_CRON_API_KEY 未配置" }, { status: 503 });
	}
	const provided = request.headers.get("x-tq-cron-key") ?? "";
	if (!provided || provided !== expected) {
		return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
	}
	const forceRun = new URL(request.url).searchParams.get("force") === "1";
	if (!forceRun) {
		const gate = await shouldRunToday();
		if (!gate.allowed) {
			return NextResponse.json({
				success: true,
				skipped: true,
				message: `cron 跳过：${gate.reason}`,
				data: { tradeDate: gate.ymd },
			});
		}
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	try {
		const result = await recalculateTqAllUsers(srv, { environment: "sim", period: "all" });
		return NextResponse.json({
			success: true,
			message: `cron 重算完成：${result.users.length} 位用户`,
			data: {
				userCount: result.users.length,
				baselineCount: result.baselineUserIds.length,
				forceRun,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "cron 重算失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
