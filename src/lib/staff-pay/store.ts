import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffPayLinkStatus = "open" | "paid" | "expired";

export type StaffPayLinkRow = {
	token: string;
	amount_cents: number;
	currency: string;
	payer_name: string;
	note: string;
	stripe_checkout_session_id: string;
	checkout_url: string;
	status: StaffPayLinkStatus;
	created_by: string;
	expires_at: string;
	paid_at: string | null;
};

export async function insertStaffPayLink(
	supabase: SupabaseClient,
	row: Omit<StaffPayLinkRow, "paid_at">,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const { error } = await supabase.from("staff_pay_links").insert({
		...row,
		paid_at: null,
	});
	if (error) return { ok: false, error: error.message };
	return { ok: true };
}

export async function getStaffPayLinkByToken(
	supabase: SupabaseClient,
	token: string,
): Promise<StaffPayLinkRow | null> {
	const { data, error } = await supabase
		.from("staff_pay_links")
		.select(
			"token, amount_cents, currency, payer_name, note, stripe_checkout_session_id, checkout_url, status, created_by, expires_at, paid_at",
		)
		.eq("token", token)
		.maybeSingle();
	if (error || !data) return null;
	return data as StaffPayLinkRow;
}

export async function expireStaffPayLinkIfNeeded(
	supabase: SupabaseClient,
	link: StaffPayLinkRow,
	now = new Date(),
): Promise<StaffPayLinkRow> {
	if (link.status !== "open") return link;
	if (new Date(link.expires_at).getTime() > now.getTime()) return link;
	await supabase.from("staff_pay_links").update({ status: "expired" }).eq("token", link.token);
	return { ...link, status: "expired" };
}

export async function markStaffPayLinkPaid(
	supabase: SupabaseClient,
	input: { sessionId: string; token?: string | null },
): Promise<void> {
	const now = new Date().toISOString();
	if (input.token) {
		await supabase
			.from("staff_pay_links")
			.update({ status: "paid", paid_at: now })
			.eq("token", input.token)
			.eq("status", "open");
		return;
	}
	await supabase
		.from("staff_pay_links")
		.update({ status: "paid", paid_at: now })
		.eq("stripe_checkout_session_id", input.sessionId)
		.eq("status", "open");
}
