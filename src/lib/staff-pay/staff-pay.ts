import { MAINLAND_FALLBACK_ORIGIN, SITE_ENTRIES } from "../site-entries.mjs";

export const STAFF_PAY_KIND = "staff_tuition";
export const STAFF_PAY_MIN_HKD = 4;
export const STAFF_PAY_MAX_HKD = 200_000;
export const STAFF_PAY_NAME_MAX = 80;
export const STAFF_PAY_NOTE_MAX = 200;

export type ParseAmountResult =
	| { ok: true; amountCents: number }
	| { ok: false; error: string };

export type StaffCheckoutCreateInput = {
	token: string;
	amountCents: number;
	payerName: string;
	note: string;
	createdBy: string;
	expiresAtUnix: number;
	origin?: string;
};

export type StaffCheckoutSessionParams = {
	mode: "payment";
	expires_at: number;
	success_url: string;
	cancel_url: string;
	metadata: {
		kind: typeof STAFF_PAY_KIND;
		token: string;
		created_by: string;
		payer_name: string;
		note: string;
	};
	line_items: Array<{
		quantity: number;
		price_data: {
			currency: "hkd";
			unit_amount: number;
			product_data: { name: string };
		};
	}>;
};

export function parseTuitionAmountHkd(raw: string): ParseAmountResult {
	const trimmed = String(raw ?? "").trim();
	if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
		return { ok: false, error: "请输入有效金额（最多两位小数）" };
	}
	const hkd = Number(trimmed);
	if (!Number.isFinite(hkd) || hkd < STAFF_PAY_MIN_HKD || hkd > STAFF_PAY_MAX_HKD) {
		return { ok: false, error: `金额须为 ${STAFF_PAY_MIN_HKD}–${STAFF_PAY_MAX_HKD} 港币` };
	}
	return { ok: true, amountCents: Math.round(hkd * 100) };
}

export function publicPayUrl(token: string, origin: string = MAINLAND_FALLBACK_ORIGIN): string {
	return `${origin.replace(/\/$/, "")}/p/${encodeURIComponent(token)}`;
}

function isLocalPreviewHost(hostname: string): boolean {
	if (hostname === "localhost" || hostname === "127.0.0.1") return true;
	const parts = hostname.split(".").map((p) => Number(p));
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return false;
	}
	const [a, b] = parts;
	if (a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	return false;
}

/** Production always uses xeoaxis.com. Local/LAN hosts are allowed only in development so WeChat on the same Wi-Fi can open the pay link. */
export function resolveStaffPayOrigin(
	requestUrl: string,
	nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
	if (nodeEnv === "production") return MAINLAND_FALLBACK_ORIGIN;
	try {
		const url = new URL(requestUrl);
		if (isLocalPreviewHost(url.hostname)) return url.origin;
	} catch {
		// fall through
	}
	return MAINLAND_FALLBACK_ORIGIN;
}

/** Mainland nginx proxies to the Worker host, so Origin (xeoaxis.com) will not match request.url. */
export function isAllowedStaffPayBrowserOrigin(request: Request): boolean {
	const raw = request.headers.get("origin") ?? request.headers.get("referer");
	if (!raw) return false;
	try {
		const host = new URL(raw).hostname.toLowerCase();
		return SITE_ENTRIES.some((entry) => entry.hostname === host);
	} catch {
		return false;
	}
}

export function buildStaffCheckoutSessionParams(
	input: StaffCheckoutCreateInput,
): StaffCheckoutSessionParams {
	const payUrl = publicPayUrl(input.token, input.origin);
	const productName = input.note
		? `学费 · ${input.payerName} · ${input.note}`
		: `学费 · ${input.payerName}`;
	return {
		mode: "payment",
		expires_at: input.expiresAtUnix,
		success_url: `${payUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${payUrl}?canceled=1`,
		metadata: {
			kind: STAFF_PAY_KIND,
			token: input.token,
			created_by: input.createdBy,
			payer_name: input.payerName,
			note: input.note,
		},
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: "hkd",
					unit_amount: input.amountCents,
					product_data: { name: productName.slice(0, 120) },
				},
			},
		],
	};
}

export function buildStaffCheckoutForm(input: StaffCheckoutCreateInput): URLSearchParams {
	const params = buildStaffCheckoutSessionParams(input);
	const item = params.line_items[0];
	const form = new URLSearchParams();
	form.set("mode", params.mode);
	form.set("expires_at", String(params.expires_at));
	form.set("success_url", params.success_url);
	form.set("cancel_url", params.cancel_url);
	form.set("line_items[0][quantity]", String(item.quantity));
	form.set("line_items[0][price_data][currency]", item.price_data.currency);
	form.set("line_items[0][price_data][unit_amount]", String(item.price_data.unit_amount));
	form.set("line_items[0][price_data][product_data][name]", item.price_data.product_data.name);
	form.set("metadata[kind]", params.metadata.kind);
	form.set("metadata[token]", params.metadata.token);
	form.set("metadata[created_by]", params.metadata.created_by);
	form.set("metadata[payer_name]", params.metadata.payer_name);
	form.set("metadata[note]", params.metadata.note);
	return form;
}

export async function createStaffStripeCheckoutSession(
	secretKey: string,
	input: StaffCheckoutCreateInput,
): Promise<{ id: string; url: string }> {
	const form = buildStaffCheckoutForm(input);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${secretKey}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form.toString(),
			signal: controller.signal,
		});
		const payload = (await response.json()) as {
			id?: string;
			url?: string;
			error?: { message?: string };
		};
		if (!response.ok) {
			throw new Error(payload.error?.message ?? `stripe_checkout_failed_${response.status}`);
		}
		if (!payload.id || !payload.url) {
			throw new Error("Stripe 未返回支付链接");
		}
		return { id: payload.id, url: payload.url };
	} catch (error) {
		if (
			(error instanceof DOMException && error.name === "AbortError") ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw new Error("Stripe响应超时，请稍后重试。");
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

export function isStaffTuitionSession(session: {
	metadata?: Record<string, string> | null;
}): boolean {
	return session.metadata?.kind === STAFF_PAY_KIND;
}

export function resolveAdminLoginNextPath(raw: string | null | undefined): string {
	const value = String(raw ?? "").trim();
	if (value === "/staff/pay") return "/staff/pay";
	if (value.startsWith("/cjkzt") && !value.startsWith("//") && !value.includes("://")) {
		return value;
	}
	return "/cjkzt";
}

export function parseStaffPayCreateBody(raw: unknown):
	| { ok: true; amountCents: number; payerName: string; note: string }
	| { ok: false; error: string } {
	if (!raw || typeof raw !== "object") {
		return { ok: false, error: "请求体格式错误" };
	}
	const body = raw as { amountHkd?: unknown; payerName?: unknown; note?: unknown };
	const amount = parseTuitionAmountHkd(String(body.amountHkd ?? ""));
	if (!amount.ok) return amount;
	const payerName = String(body.payerName ?? "").trim();
	if (!payerName) return { ok: false, error: "请填写学生姓名" };
	if (payerName.length > STAFF_PAY_NAME_MAX) {
		return { ok: false, error: `姓名最多 ${STAFF_PAY_NAME_MAX} 字` };
	}
	const note = String(body.note ?? "").trim();
	if (note.length > STAFF_PAY_NOTE_MAX) {
		return { ok: false, error: `备注最多 ${STAFF_PAY_NOTE_MAX} 字` };
	}
	return { ok: true, amountCents: amount.amountCents, payerName, note };
}

export function checkoutExpiresAtUnix(nowMs = Date.now()): number {
	const min = Math.floor(nowMs / 1000) + 30 * 60;
	const max = Math.floor(nowMs / 1000) + 24 * 60 * 60;
	return max - 60 < min ? min : max - 60;
}
