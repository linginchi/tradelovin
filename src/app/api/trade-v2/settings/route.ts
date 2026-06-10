import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2SettingsApiResponse, TradeV2UserTradePrefs } from "@/lib/trade-v2/api-types";
import {
	DEFAULT_QUICK_ORDER_PREFS,
	parseQuickOrderPrefs,
	type QuickOrderPrefs,
} from "@/lib/trade-v2/quick-order-prefs";

export const runtime = "nodejs";

type Body = {
	defaultQty?: unknown;
	defaultAccountType?: unknown;
	defaultPositionMode?: unknown;
	defaultSourceMode?: unknown;
	autoLogoutNight?: unknown;
	quickOrderPrefs?: unknown;
};

function rowToPrefs(data: Record<string, unknown>): TradeV2UserTradePrefs {
	return {
		default_qty: Number(data.default_qty),
		default_account_type: data.default_account_type as "normal" | "credit",
		default_position_mode: data.default_position_mode as "long" | "short",
		default_source_mode: data.default_source_mode as "normal" | "fast",
		auto_logout_night: Boolean(data.auto_logout_night),
		quick_order_prefs: parseQuickOrderPrefs(data.quick_order_prefs),
	};
}

function defaultPrefs(): TradeV2UserTradePrefs {
	return {
		default_qty: 100,
		default_account_type: "normal",
		default_position_mode: "long",
		default_source_mode: "normal",
		auto_logout_night: false,
		quick_order_prefs: DEFAULT_QUICK_ORDER_PREFS,
	};
}

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const { data, error } = await ctx.supabase
		.from("tq_user_trade_prefs")
		.select("*")
		.eq("user_id", ctx.userId)
		.maybeSingle();
	if (error) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json<TradeV2SettingsApiResponse>({
			success: true,
			data: defaultPrefs(),
		});
	}
	return NextResponse.json<TradeV2SettingsApiResponse>({
		success: true,
		data: rowToPrefs(data as Record<string, unknown>),
	});
}

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const defaultQty =
		typeof body.defaultQty === "number" ? Math.trunc(body.defaultQty) : Math.trunc(Number(body.defaultQty));
	if (!Number.isInteger(defaultQty) || defaultQty <= 0) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "defaultQty 必须为正整数" }, { status: 400 });
	}

	const defaultAccountType = body.defaultAccountType === "credit" ? "credit" : "normal";
	const defaultPositionMode = body.defaultPositionMode === "short" ? "short" : "long";
	const defaultSourceMode = body.defaultSourceMode === "fast" ? "fast" : "normal";
	const autoLogoutNight = body.autoLogoutNight === true;
	const quickOrderPrefs: QuickOrderPrefs = parseQuickOrderPrefs(body.quickOrderPrefs);

	const { data, error } = await ctx.supabase
		.from("tq_user_trade_prefs")
		.upsert(
			{
				user_id: ctx.userId,
				default_qty: defaultQty,
				default_account_type: defaultAccountType,
				default_position_mode: defaultPositionMode,
				default_source_mode: defaultSourceMode,
				auto_logout_night: autoLogoutNight,
				quick_order_prefs: quickOrderPrefs,
			},
			{ onConflict: "user_id" },
		)
		.select("*")
		.single();
	if (error || !data) {
		return NextResponse.json(
			{ success: false, error: error?.message ?? "保存偏好设置失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
	return NextResponse.json<TradeV2SettingsApiResponse>({
		success: true,
		data: rowToPrefs(data as Record<string, unknown>),
	});
}
