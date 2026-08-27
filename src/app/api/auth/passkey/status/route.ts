import { NextResponse, type NextRequest } from "next/server";

import { loadPasskeyCredentialForUserRp, requirePasskeyService, resolveRequestRpId } from "@/lib/auth/passkey-api";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const rpId = resolveRequestRpId(request);
	if (rpId instanceof NextResponse) return rpId;

	const srv = requirePasskeyService();
	if (srv instanceof NextResponse) return srv;

	const row = await loadPasskeyCredentialForUserRp(srv, auth.userId, rpId);
	return NextResponse.json({ success: true, enrolled: Boolean(row), rpId });
}
