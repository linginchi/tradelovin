import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthUserIdByEmail } from "@/lib/auth/profile-resolve";

/** 管理员 auth 用户 id 在 profiles 中存在时，用于写入 registrations.reviewed_by（FK → profiles.id） */
export async function getReviewerProfileId(
	supabase: SupabaseClient,
	email: string,
): Promise<string | null> {
	const uid = await getAuthUserIdByEmail(supabase, email.trim().toLowerCase());
	if (!uid) return null;
	const { data } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
	return (data?.id as string | undefined) ?? null;
}
