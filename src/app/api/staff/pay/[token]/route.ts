import { NextResponse } from "next/server";

import { expireStaffPayLinkIfNeeded, getStaffPayLinkByToken } from "@/lib/staff-pay/store";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
	const { token } = await params;
	if (!token || token.length < 8) {
		return NextResponse.json({ success: false, error: "链接无效" }, { status: 400 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	const found = await getStaffPayLinkByToken(supabase, token);
	if (!found) {
		return NextResponse.json({ success: false, error: "链接不存在或已失效" }, { status: 404 });
	}

	const link = await expireStaffPayLinkIfNeeded(supabase, found);
	const expired = link.status === "expired";
	const paid = link.status === "paid";

	return NextResponse.json({
		success: true,
		status: link.status,
		amountCents: link.amount_cents,
		currency: link.currency,
		payerName: link.payer_name,
		note: link.note,
		checkoutUrl: expired || paid ? null : link.checkout_url,
		expiresAt: link.expires_at,
	});
}
