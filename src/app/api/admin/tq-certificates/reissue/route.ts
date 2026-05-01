import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getMembershipSnapshot } from "@/lib/membership/service";
import type { MembershipTier } from "@/lib/membership/types";
import { getServiceSupabase } from "@/lib/supabase/service";
import { issueTqCertificate } from "@/lib/tq/certificate/service";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";

export const runtime = "nodejs";

type Body = {
	userId?: string;
	env?: string;
	period?: string;
	tier?: MembershipTier;
};

function readTier(v: string | undefined | null): MembershipTier | null {
	if (v === "T1" || v === "T2" || v === "T3") return v;
	return null;
}

export async function POST(request: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	let body: Body = {};
	try {
		body = (await request.json()) as Body;
	} catch {
		// fallback
	}
	const userId = String(body.userId ?? "").trim();
	if (!userId) return NextResponse.json({ success: false, error: "缺少 userId" }, { status: 400 });
	const environment = readTqEnv(body.env ?? null);
	const period = readTqPeriod(body.period ?? null);
	let tier = readTier(body.tier ?? null);
	if (!tier) {
		const snapshot = await getMembershipSnapshot(srv, userId);
		tier = snapshot?.tier ?? "T1";
	}
	try {
		const cert = await issueTqCertificate(srv, {
			userId,
			tier,
			environment,
			period,
		});
		return NextResponse.json({
			success: true,
			data: {
				id: cert.record.id,
				userId,
				environment,
				period,
				tier: cert.record.membership_tier,
				issuedAt: cert.record.issued_at,
				pdfUrl: cert.pdfUrl,
				imageUrl: cert.imageUrl,
				templateVersion: cert.record.template_version,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "重签发失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}

