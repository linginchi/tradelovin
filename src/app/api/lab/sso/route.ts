import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { issueLabAuthCode } from "@/lib/lab/sso";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

/** 学员端：签发一次性实验室授权码（需 T2+ lab_access） */
export async function POST() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const membership = await requireMembershipCapability(auth.supabase, auth.userId, "lab_access");
	if (membership instanceof NextResponse) return membership;

	try {
		const issued = await issueLabAuthCode(auth.userId);
		return NextResponse.json({
			success: true,
			code: issued.code,
			expiresIn: issued.expiresIn,
			labBaseUrl: issued.labBaseUrl,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[lab/sso] issue failed", { userId: auth.userId, message });
		return NextResponse.json({ success: false, error: message }, { status: 503 });
	}
}
