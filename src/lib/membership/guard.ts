import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSuperUserById } from "@/lib/auth/super-user";
import { upsertBaseMembership } from "@/lib/membership/manage";
import { getMembershipSnapshot } from "@/lib/membership/service";
import type { MembershipCapability, MembershipSnapshot } from "@/lib/membership/types";
import {
	LEGACY_TRADE_ACCESS_DENIED_CODES,
} from "@/lib/trade-v2/api-types";
import {
	canUseLabAccess,
	canUseSimTrading,
	canUseTqReport,
	ensureCurrentMembership,
} from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";

function buildSuperUserMembershipSnapshot(userId: string): MembershipSnapshot {
	const now = new Date();
	const farFuture = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
	const iso = now.toISOString();
	const endIso = farFuture.toISOString();
	return {
		userId,
		tier: "T3",
		status: "active",
		trialStartAt: iso,
		trialEndAt: endIso,
		currentPeriodStart: iso,
		currentPeriodEnd: endIso,
		lastPaidAt: iso,
		pointsBalance: 1_000_000,
		effective: {
			simTrading: true,
			tqReport: true,
			l2Market: true,
			advancedOrderBundle: true,
			labAccess: true,
		},
	};
}

export type MembershipGuardOk = { membership: MembershipSnapshot };

function capabilityAllowed(snapshot: MembershipSnapshot, capability: MembershipCapability): boolean {
	if (capability === "sim_trading") return snapshot.effective.simTrading;
	if (capability === "tq_report") return snapshot.effective.tqReport;
	if (capability === "lab_access") {
		// The lab's external SSO must never grant access based on a stale legacy
		// entitlement. Its product rule is explicitly T2+ *and active*.
		return (
			(snapshot.tier === "T2" || snapshot.tier === "T3") &&
			snapshot.status === "active" &&
			Boolean(snapshot.currentPeriodEnd && new Date(snapshot.currentPeriodEnd).getTime() >= Date.now())
		);
	}
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
	const srv = getServiceSupabase();
	if (srv && (await isSuperUserById(srv, userId))) {
		return { membership: buildSuperUserMembershipSnapshot(userId) };
	}

	const v2Membership = await ensureCurrentMembership(supabase, userId);
	if (v2Membership) {
		let allowed = false;
		if (capability === "sim_trading") allowed = canUseSimTrading(v2Membership);
		else if (capability === "tq_report") allowed = canUseTqReport(v2Membership);
		else if (capability === "lab_access") allowed = canUseLabAccess(v2Membership);
		else if (capability === "l2_market" || capability === "advanced_order_bundle") {
			allowed = v2Membership.plan === "T3" && v2Membership.status === "active";
		}
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
		if (capability === "lab_access") {
			const tier = v2Membership.plan === "T3" ? "T3" : "T2";
			return {
				membership: {
					userId,
					tier,
					status: "active",
					trialStartAt: v2Membership.createdAt,
					trialEndAt: v2Membership.trialEnd ?? v2Membership.currentPeriodEnd,
					currentPeriodStart: v2Membership.currentPeriodStart,
					currentPeriodEnd: v2Membership.currentPeriodEnd,
					lastPaidAt: v2Membership.updatedAt,
					pointsBalance: 0,
					effective: {
						simTrading: canUseSimTrading(v2Membership),
						tqReport: canUseTqReport(v2Membership),
						l2Market: false,
						advancedOrderBundle: false,
						labAccess: true,
					},
				},
			};
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
  const srv = getServiceSupabase();
  if (srv && (await isSuperUserById(srv, userId))) {
    return true;
  }

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
