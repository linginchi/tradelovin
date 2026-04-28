import type { SupabaseClient } from "@supabase/supabase-js";

/** 模拟账户仅绑定 auth.users.id，不读 public.profiles。 */

export type SimAccountRow = {
	id: string;
	user_id: string;
	account_name: string;
	initial_balance: number;
	current_balance: number;
	frozen_balance: number;
	status: string;
};

export async function getOrCreateSimAccount(
	supabase: SupabaseClient,
	userId: string,
): Promise<{ data: SimAccountRow | null; error: Error | null }> {
	const { data: existing, error: selErr } = await supabase
		.from("sim_accounts")
		.select("id,user_id,account_name,initial_balance,current_balance,frozen_balance,status")
		.eq("user_id", userId)
		.maybeSingle();
	if (selErr) {
		return { data: null, error: new Error(selErr.message) };
	}
	if (existing) {
		return { data: existing as SimAccountRow, error: null };
	}
	const { data: inserted, error: insErr } = await supabase
		.from("sim_accounts")
		.insert({
			user_id: userId,
			account_name: "主账户",
			initial_balance: 100000,
			current_balance: 100000,
			frozen_balance: 0,
		})
		.select("id,user_id,account_name,initial_balance,current_balance,frozen_balance,status")
		.single();
	if (insErr) {
		return { data: null, error: new Error(insErr.message) };
	}
	return { data: inserted as SimAccountRow, error: null };
}
