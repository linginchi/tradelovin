import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertBaseMembership } from "@/lib/membership/manage";
import { getMembershipSnapshot } from "@/lib/membership/service";
import type { MembershipCapability, MembershipSnapshot } from "@/lib/membership/types";
import {
	LEGACY_TRADE_ACCESS_DENIED_CODES,
} from "@/lib/trade-v2/api-types";
import { canUseSimTrading, canUseTqReport, ensureCurrentMembership } from "@/lib/membership/v2";
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
				error: "P1 · 雪豹试用已到期，请升级会员以继续模拟交易",
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
	const v2Membership = await ensureCurrentMembership(supabase, userId);
	if (v2Membership) {
		const allowed =
			capability === "sim_trading"
				? canUseSimTrading(v2Membership)
				: capability === "tq_report"
					? canUseTqReport(v2Membership)
					: capability === "l2_market"
						? v2Membership.plan === "T3" && v2Membership.status === "active"
						: v2Membership.plan === "T3" && v2Membership.status === "active";
		if (!allowed) {
			if (capability === "sim_trading" && (v2Membership.plan === "T0_trial" || v2Membership.plan === "T0_paid")) {
				return NextResponse.json(
					{
						success: false,
						error: "试用已结束，请升级会员继续使用模拟交易和TQ评分",
						code: LEGACY_TRADE_ACCESS_DENIED_CODES[0],
					},
					{ status: 402 },
				);
			}
			return NextResponse.json(
				{
					success: false,
					error: "当前会员级别无此权限",
					code: LEGACY_TRADE_ACCESS_DENIED_CODES[1],
				},
				{ status: 403 },
			);
		}
	}

	let snapshot = await getMembershipSnapshot(supabase, userId);
	if (!snapshot) {
		const srv = getServiceSupabase();
		if (srv) {
			try {
				await upsertBaseMembership(srv, userId);
				snapshot = await getMembershipSnapshot(supabase, userId);
			} catch (error) {
				console.error("[membership] upsert base failed in guard", {
					userId,
					capability,
					code: "MEMBERSHIP_BOOTSTRAP_FAILED",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}
	if (!snapshot || !capabilityAllowed(snapshot, capability)) {
		const deny = denyPayload(capability, snapshot);
		return NextResponse.json(deny.body, { status: deny.status });
	}
	return { membership: snapshot };
}

export async function checkMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<true | NextResponse> {
  const membership = await ensureCurrentMembership(supabase, userId);
  if (!membership) {
    return NextResponse.json(
      {
        success: false,
        error: "会员信息不存在，请先完成会员开通",
      },
      { status: 403 },
    );
  }
  const nowMs = Date.now();
  const endMs = new Date(membership.currentPeriodEnd).getTime();
  const trialMs = membership.trialEnd ? new Date(membership.trialEnd).getTime() : 0;
  const valid =
    (membership.plan === "T0_trial" && trialMs >= nowMs) ||
    ((membership.plan === "T1" || membership.plan === "T2" || membership.plan === "T3") &&
      membership.status === "active" &&
      endMs >= nowMs);
  if (!valid) {
    return NextResponse.json(
      {
        success: false,
        error: "会员已过期，请升级后继续使用",
      },
      { status: 403 },
    );
  }
  return true;
}
