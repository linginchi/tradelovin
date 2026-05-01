import { NextResponse } from "next/server";

import { upsertBaseMembership } from "@/lib/membership/manage";
import { TQ_POINTS_RULES } from "@/lib/membership/points";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const v2Membership = await ensureCurrentMembership(auth.supabase, auth.userId);
	const { data: pointsRow } = await auth.supabase
		.from("user_points")
		.select("balance")
		.eq("user_id", auth.userId)
		.maybeSingle();

	if (v2Membership) {
		const trialDaysLeft = v2Membership.trialEnd
			? Math.max(
					0,
					Math.ceil(
						(new Date(v2Membership.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
					),
				)
			: 0;
		const legacyTier =
			v2Membership.plan === "T2" ? "T2" : v2Membership.plan === "T3" ? "T3" : "T1";
		return NextResponse.json({
			success: true,
			data: {
				tier: legacyTier,
				plan: v2Membership.plan,
				status: v2Membership.status,
				trialEndAt: v2Membership.trialEnd ?? v2Membership.currentPeriodEnd,
				trialDaysLeft,
				currentPeriodEnd: v2Membership.currentPeriodEnd,
				pointsBalance: Number(pointsRow?.balance ?? 0),
				redeemPlans: TQ_POINTS_RULES.t3RedeemPlans,
			},
		});
	}

	let membership = await getMembershipSnapshot(auth.supabase, auth.userId);
	if (!membership) {
		const srv = getServiceSupabase();
		if (srv) {
			try {
				await upsertBaseMembership(srv, auth.userId);
				membership = await getMembershipSnapshot(auth.supabase, auth.userId);
			} catch (error) {
				console.error("[membership/me] upsert base failed", {
					userId: auth.userId,
					code: "MEMBERSHIP_BOOTSTRAP_FAILED",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	if (!membership) {
		return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
	}

	return NextResponse.json({
		success: true,
		data: {
			...membership,
			trialDaysLeft: Math.max(
				0,
				Math.ceil((new Date(membership.trialEndAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
			),
			redeemPlans: TQ_POINTS_RULES.t3RedeemPlans,
		},
	});
}
