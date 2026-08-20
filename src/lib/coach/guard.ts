import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSuperUserById } from "@/lib/auth/super-user";
import { GOLDEN_LEOPARD_COACH_BADGE, isActiveT3Plan } from "@/lib/coach/types";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser, type TradeAuthedContext } from "@/lib/trade/require-user";

export type CoachDeskOk = TradeAuthedContext & { service: SupabaseClient };

export async function loadIsCoach(service: SupabaseClient, userId: string): Promise<boolean> {
	const { data, error } = await service.from("profiles").select("is_coach").eq("id", userId).maybeSingle();
	if (error) throw new Error(error.message);
	return Boolean((data as { is_coach?: boolean } | null)?.is_coach);
}

export async function canOpenCoachDesk(service: SupabaseClient, userId: string): Promise<{
	isCoach: boolean;
	canOpenDesk: boolean;
}> {
	const isCoach = await loadIsCoach(service, userId);
	if (!isCoach) return { isCoach: false, canOpenDesk: false };
	if (await isSuperUserById(service, userId)) {
		return { isCoach: true, canOpenDesk: true };
	}
	const membership = await ensureCurrentMembership(service, userId);
	const canOpenDesk = isActiveT3Plan(
		membership?.plan,
		membership?.status,
		membership?.currentPeriodEnd ?? null,
	);
	return { isCoach: true, canOpenDesk };
}

export async function requireCoachDesk(): Promise<CoachDeskOk | NextResponse> {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	const access = await canOpenCoachDesk(service, ctx.userId);
	if (!access.isCoach) {
		return NextResponse.json(
			{ success: false, error: "你还不是金钱豹教练。下一步：请管理员在后台讲师页勾选任命。" },
			{ status: 403 },
		);
	}
	if (!access.canOpenDesk) {
		return NextResponse.json(
			{ success: false, error: "教练工作台需要有效的 P3 · 金钱豹会员。下一步：续费或升级到 T3 后再进入。" },
			{ status: 403 },
		);
	}
	return { supabase: ctx.supabase, userId: ctx.userId, service };
}

export function coachBadgePayload() {
	return { ...GOLDEN_LEOPARD_COACH_BADGE };
}
