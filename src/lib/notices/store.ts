import type { SupabaseClient } from "@supabase/supabase-js";

import { sortNoticesForInbox, type AppNotice } from "@/lib/notices/notices";

const NOTICE_COLUMNS = "id,user_id,title,body,created_by,read_at,created_at";

export async function listNoticesForUser(
	supabase: SupabaseClient,
	userId: string,
): Promise<AppNotice[]> {
	const { data, error } = await supabase
		.from("app_notices")
		.select(NOTICE_COLUMNS)
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(50);
	if (error) throw new Error(error.message);
	return sortNoticesForInbox((data ?? []) as AppNotice[]);
}

export async function markNoticesReadForUser(
	supabase: SupabaseClient,
	userId: string,
	ids: string[] | "all",
): Promise<void> {
	const now = new Date().toISOString();
	let query = supabase
		.from("app_notices")
		.update({ read_at: now })
		.eq("user_id", userId)
		.is("read_at", null);
	if (ids !== "all") {
		if (ids.length === 0) return;
		query = query.in("id", ids);
	}
	const { error } = await query;
	if (error) throw new Error(error.message);
}

export async function insertNotice(
	supabase: SupabaseClient,
	input: { userId: string; title: string; body: string; createdBy: string },
): Promise<AppNotice> {
	const { data, error } = await supabase
		.from("app_notices")
		.insert({
			user_id: input.userId,
			title: input.title,
			body: input.body,
			created_by: input.createdBy,
		})
		.select(NOTICE_COLUMNS)
		.single();
	if (error) throw new Error(error.message);
	return data as AppNotice;
}
