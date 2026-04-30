import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertBaseMembership } from "@/lib/membership/manage";
import { getMembershipSnapshot } from "@/lib/membership/service";
import type { MembershipCapability, MembershipSnapshot } from "@/lib/membership/types";
import { getServiceSupabase } from "@/lib/supabase/service";

export type MembershipGuardOk = { membership: MembershipSnapshot };

function capabilityAllowed(snapshot: MembershipSnapshot, capability: MembershipCapability): boolean {
	if (capability === "sim_trading") return snapshot.effective.simTrading;
	if (capability === "tq_report") return snapshot.effective.tqReport;
	if (capability === "l2_market") return snapshot.effective.l2Market;
	return snapshot.effective.advancedOrderBundle;
}

function denyPayload(capability: MembershipCapability, snapshot: MembershipSnapshot | null) {
	if (!snapshot) {
		return {
			status: 403,
			body: {
				success: false,
				error: "会员信息不存在，请联系管理员处理",
				code: "MEMBERSHIP_NOT_FOUND",
			},
		};
	}
	if (capability === "sim_trading" && snapshot.tier === "T1") {
		return {
			status: 402,
			body: {
				success: false,
				error: "T1试用已到期，请升级会员以继续模拟交易",
				code: "TRIAL_EXPIRED",
			},
		};
	}
	return {
		status: 403,
		body: {
			success: false,
			error: "当前会员级别无此权限",
			code: "MEMBERSHIP_FORBIDDEN",
		},
	};
}

export async function requireMembershipCapability(
	supabase: SupabaseClient,
	userId: string,
	capability: MembershipCapability,
): Promise<MembershipGuardOk | NextResponse> {
	let snapshot = await getMembershipSnapshot(supabase, userId);
	if (!snapshot) {
		const srv = getServiceSupabase();
		if (srv) {
			try {
				await upsertBaseMembership(srv, userId);
				snapshot = await getMembershipSnapshot(supabase, userId);
			} catch {
				// 初始化失败时保持原有拒绝行为
			}
		}
	}
	if (!snapshot || !capabilityAllowed(snapshot, capability)) {
		const deny = denyPayload(capability, snapshot);
		return NextResponse.json(deny.body, { status: deny.status });
	}
	return { membership: snapshot };
}
