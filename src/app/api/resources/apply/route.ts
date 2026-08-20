import { NextResponse } from "next/server";

import { createResourceRequest, getStudentBinding } from "@/lib/coach/service";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { normalizeTradeApiError, SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import type { ApiErrorResponse } from "@/lib/trade-v2/api-types";
import type { ResourceSide } from "@/lib/trade-v2/resources";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	side?: unknown;
	quantity?: unknown;
};

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}
	const symbol = normalizeCnSymbol(typeof body.symbol === "string" ? body.symbol : "");
	const sideRaw = typeof body.side === "string" ? body.side.trim().toLowerCase() : "";
	const side: ResourceSide = sideRaw === "short" ? "short" : "long";
	const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);

	if (!isCanonicalCnSymbol(symbol)) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: SYMBOL_FORMAT_ERROR_MESSAGE }, { status: 400 });
	}
	if (!Number.isInteger(quantity) || quantity <= 0) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "quantity 必须为正整数" }, { status: 400 });
	}

	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	try {
		const binding = await getStudentBinding(service, userId);
		if (!binding || binding.status !== "accepted") {
			return NextResponse.json(
				{
					success: false,
					error: "请先选择金钱豹教练并等待对方接受。下一步：在「资源」面板选择教练并提交绑定。",
				} satisfies ApiErrorResponse,
				{ status: 400 },
			);
		}
		const data = await createResourceRequest(service, {
			studentId: userId,
			coachId: binding.coach_id,
			symbol,
			side,
			quantity,
		});
		return NextResponse.json({
			success: true,
			data: {
				...data,
				pending: true,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: normalizeTradeApiError(error, "申请资源失败") } satisfies ApiErrorResponse,
			{ status: 400 },
		);
	}
}
