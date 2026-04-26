import type { SupabaseClient } from "@supabase/supabase-js";

/** 管理员在 profiles 中有同邮箱时，用于写入 registrations.reviewed_by */
export async function getReviewerProfileId(
	supabase: SupabaseClient,
	email: string,
): Promise<string | null> {
	const e = email.trim().toLowerCase();
	const { data } = await supabase.from("profiles").select("id").ilike("email", e).maybeSingle();
	return (data?.id as string | undefined) ?? null;
}
