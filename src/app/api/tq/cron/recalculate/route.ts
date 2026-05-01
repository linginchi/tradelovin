import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { recalculateTqAllUsers } from "@/lib/tq/engine";
import { type TqEnvironment, type TqPeriod } from "@/lib/tq/constants";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";
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

function parseListParam(value: string | null, mode: "env" | "period"): (TqEnvironment | TqPeriod)[] {
	if (!value?.trim()) return mode === "env" ? ["sim", "live"] : ["all"];
	const parts = value
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
	if (!parts.length) return mode === "env" ? ["sim", "live"] : ["all"];
	if (mode === "env") {
		const dedup = new Set<TqEnvironment>();
		for (const part of parts) dedup.add(readTqEnv(part));
		return [...dedup];
	}
	const dedup = new Set<TqPeriod>();
	for (const part of parts) dedup.add(readTqPeriod(part));
	return [...dedup];
}

async function createCronRun(
	srv: ReturnType<typeof getServiceSupabase>,
	payload: Record<string, unknown>,
): Promise<number | null> {
	if (!srv) return null;
	const { data } = await srv
		.from("tq_cron_runs")
		.insert({ status: "running", response: payload })
		.select("id")
		.limit(1)
		.maybeSingle();
	return data?.id ?? null;
}

async function finishCronRun(
	srv: ReturnType<typeof getServiceSupabase>,
	runId: number | null,
	status: "success" | "failed" | "skipped",
	payload: Record<string, unknown>,
): Promise<void> {
	if (!srv || !runId) return;
	await srv
		.from("tq_cron_runs")
		.update({ status, response: payload })
		.eq("id", runId);
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
	const url = new URL(request.url);
	let body: { env?: string; period?: string } = {};
	try {
		body = (await request.clone().json()) as { env?: string; period?: string };
	} catch {
		// no-op
	}
	const forceRun = url.searchParams.get("force") === "1";
	const envParam = body.env ?? url.searchParams.get("env");
	const periodParam = body.period ?? url.searchParams.get("period");
	const environments = parseListParam(envParam, "env") as TqEnvironment[];
	const periods = parseListParam(periodParam, "period") as TqPeriod[];
	const retryLimit = Math.max(0, Math.min(3, Number(url.searchParams.get("retry") ?? 1)));
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
	const runId = await createCronRun(srv, {
		forceRun,
		environments,
		periods,
		retryLimit,
		requestedAt: new Date().toISOString(),
	});

	try {
		const summaries: Array<{ environment: TqEnvironment; period: TqPeriod; userCount: number; baselineCount: number }> =
			[];
		for (const environment of environments) {
			for (const period of periods) {
				let attempt = 0;
				let ok = false;
				let lastError = "";
				while (attempt <= retryLimit && !ok) {
					attempt += 1;
					try {
						const result = await recalculateTqAllUsers(srv, { environment, period });
						summaries.push({
							environment,
							period,
							userCount: result.users.length,
							baselineCount: result.baselineUserIds.length,
						});
						ok = true;
					} catch (error) {
						lastError = error instanceof Error ? error.message : "cron 重算失败";
						if (attempt > retryLimit) {
							throw new Error(`[${environment}/${period}] ${lastError}`);
						}
					}
				}
			}
		}
		const totalUsers = summaries.reduce((sum, item) => sum + item.userCount, 0);
		await finishCronRun(srv, runId, "success", {
			forceRun,
			environments,
			periods,
			retryLimit,
			totalUsers,
			summaries,
			finishedAt: new Date().toISOString(),
		});
		return NextResponse.json({
			success: true,
			message: `cron 重算完成：${totalUsers} 位用户`,
			data: {
				forceRun,
				retryLimit,
				summaries,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "cron 重算失败";
		await finishCronRun(srv, runId, "failed", {
			forceRun,
			environments,
			periods,
			retryLimit,
			error: message,
			finishedAt: new Date().toISOString(),
		});
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
