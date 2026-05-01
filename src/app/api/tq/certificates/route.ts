import { NextResponse } from "next/server";

import { getMembershipSnapshot } from "@/lib/membership/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getLatestTqCertificate, issueTqCertificate } from "@/lib/tq/certificate/service";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const url = new URL(request.url);
	const environment = readTqEnv(url.searchParams.get("env"));
	const period = readTqPeriod(url.searchParams.get("period"));
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	try {
		const cert = await getLatestTqCertificate(srv, {
			userId: auth.userId,
			environment,
			period,
		});
		if (!cert) return NextResponse.json({ success: true, data: null });
		return NextResponse.json({
			success: true,
			data: {
				id: cert.record.id,
				environment: cert.record.environment,
				period: cert.record.period,
				tier: cert.record.membership_tier,
				issuedAt: cert.record.issued_at,
				pdfUrl: cert.pdfUrl,
				imageUrl: cert.imageUrl,
				templateVersion: cert.record.template_version,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "读取证书失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	let body: { env?: string; period?: string } = {};
	try {
		body = (await request.json()) as { env?: string; period?: string };
	} catch {
		// ignore and fallback to defaults
	}
	const environment = readTqEnv(body.env ?? null);
	const period = readTqPeriod(body.period ?? null);
	try {
		const snapshot = await getMembershipSnapshot(auth.supabase, auth.userId);
		if (!snapshot) {
			return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
		}
		const cert = await issueTqCertificate(srv, {
			userId: auth.userId,
			tier: snapshot.tier,
			environment,
			period,
		});
		return NextResponse.json({
			success: true,
			data: {
				id: cert.record.id,
				environment: cert.record.environment,
				period: cert.record.period,
				tier: cert.record.membership_tier,
				issuedAt: cert.record.issued_at,
				pdfUrl: cert.pdfUrl,
				imageUrl: cert.imageUrl,
				templateVersion: cert.record.template_version,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "生成证书失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}

