import { NextResponse } from "next/server";

import { upsertBaseMembership } from "@/lib/membership/manage";
import { TQ_POINTS_RULES } from "@/lib/membership/points";
import { getMembershipSnapshot } from "@/lib/membership/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	let membership = await getMembershipSnapshot(auth.supabase, auth.userId);
	if (!membership) {
		const srv = getServiceSupabase();
		if (srv) {
			try {
				await upsertBaseMembership(srv, auth.userId);
				membership = await getMembershipSnapshot(auth.supabase, auth.userId);
			} catch {
				// ignore and return original not found
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
