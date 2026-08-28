import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/billing/stripe";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { STAFF_PAY_CREATED_BY } from "@/lib/staff-pay/gate";
import { requireStaffPaySession } from "@/lib/staff-pay/session";
import {
	buildStaffCheckoutSessionParams,
	checkoutExpiresAtUnix,
	parseStaffPayCreateBody,
	publicPayUrl,
	resolveStaffPayOrigin,
} from "@/lib/staff-pay/staff-pay";
import { insertStaffPayLink } from "@/lib/staff-pay/store";
import { generateStaffPayToken } from "@/lib/staff-pay/token";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const csrf = requireSameOriginForMutation(request);
	if (csrf) return csrf;

	const gated = await requireStaffPaySession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = parseStaffPayCreateBody(raw);
	if (!parsed.ok) {
		return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
	}

	const token = generateStaffPayToken();
	const expiresAtUnix = checkoutExpiresAtUnix();
	const origin = resolveStaffPayOrigin(request.url);
	const payUrl = publicPayUrl(token, origin);
	const params = buildStaffCheckoutSessionParams({
		token,
		amountCents: parsed.amountCents,
		payerName: parsed.payerName,
		note: parsed.note,
		createdBy: STAFF_PAY_CREATED_BY,
		expiresAtUnix,
		origin,
	});

	try {
		const stripe = getStripeClient();
		const session = await stripe.checkout.sessions.create(params as Parameters<
			typeof stripe.checkout.sessions.create
		>[0]);
		if (!session.url) {
			return NextResponse.json({ success: false, error: "Stripe 未返回支付链接" }, { status: 502 });
		}

		const inserted = await insertStaffPayLink(supabase, {
			token,
			amount_cents: parsed.amountCents,
			currency: "hkd",
			payer_name: parsed.payerName,
			note: parsed.note,
			stripe_checkout_session_id: session.id,
			checkout_url: session.url,
			status: "open",
			created_by: STAFF_PAY_CREATED_BY,
			expires_at: new Date(expiresAtUnix * 1000).toISOString(),
		});
		if (!inserted.ok) {
			return NextResponse.json({ success: false, error: inserted.error }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			token,
			payUrl,
			amountCents: parsed.amountCents,
			payerName: parsed.payerName,
			note: parsed.note,
			expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
		});
	} catch (error) {
		const raw = error instanceof Error ? error.message : "创建支付会话失败";
		const message = raw.includes("STRIPE_SECRET_KEY")
			? "支付配置缺失：未配置 STRIPE_SECRET_KEY（与会员升级同一项 Cloudflare Worker Secret，本地请写入 .env.local 后重启）"
			: raw;
		console.error("[staff/pay create]", raw);
		return NextResponse.json({ success: false, error: message }, { status: 502 });
	}
}
