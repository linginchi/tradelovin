import { NextResponse } from "next/server";

import type { ApiErrorResponse, TradeV2ForceCloseApiResponse } from "@/lib/trade-v2/api-types";
import { runForceCloseJob } from "@/lib/trade-v2/force-close";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	const cronKeyHeader = request.headers.get("x-tq-cron-key");
	const cronKeyEnv = process.env.TQ_CRON_API_KEY ?? "";

	// 定时任务调用：需要 cron key。
	if (!cronKeyHeader || !cronKeyEnv || cronKeyHeader !== cronKeyEnv) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "forbidden" }, { status: 403 });
	}

	try {
		const data = await runForceCloseJob(service, {
			scope: "all",
			triggerSource: "cron",
			triggeredBy: null,
		});
		return NextResponse.json<TradeV2ForceCloseApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "强平失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}
