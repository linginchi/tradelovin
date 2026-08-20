import type { SupabaseClient } from "@supabase/supabase-js";

import { isSeedAccountEmail } from "@/lib/auth/seed-accounts";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { isSuperUserEmail, SUPER_USER_EMAILS } from "@/lib/auth/super-user";
import { displayNameFromProfile } from "@/lib/coach/types";

export type AdminUserDirectoryRow = {
	userId: string;
	studentId: string | null;
	name: string;
	email: string | null;
	role: string | null;
	isCoach: boolean;
	isSeed: boolean;
	isAdmin: boolean;
	adminRole: string | null;
	isSuperUser: boolean;
};

type ProfileRow = {
	id: string;
	real_name: string | null;
	nickname: string | null;
	student_id: string | null;
	role: string | null;
	is_coach?: boolean | null;
};

type AdminRow = {
	email: string;
	role: string | null;
};

export async function loadAdminUserDirectory(
	service: SupabaseClient,
	userIds: string[],
): Promise<Map<string, AdminUserDirectoryRow>> {
	const unique = [...new Set(userIds.filter(Boolean))];
	const out = new Map<string, AdminUserDirectoryRow>();
	if (unique.length === 0) return out;

	const [emailMap, profileRes, adminRes] = await Promise.all([
		getAuthEmailsByUserIds(service, unique),
		service.from("profiles").select("id, real_name, nickname, student_id, role, is_coach").in("id", unique),
		service.from("admins").select("email, role"),
	]);
	if (profileRes.error) throw new Error(profileRes.error.message);
	if (adminRes.error) throw new Error(adminRes.error.message);

	const profileMap = new Map((profileRes.data ?? []).map((row) => [row.id as string, row as ProfileRow]));
	const adminByEmail = new Map(
		((adminRes.data ?? []) as AdminRow[]).map((row) => [String(row.email ?? "").trim().toLowerCase(), row]),
	);

	for (const userId of unique) {
		const email = emailMap.get(userId) ?? null;
		const profile = profileMap.get(userId);
		const admin = email ? adminByEmail.get(email) : undefined;
		out.set(userId, {
			userId,
			studentId: profile?.student_id?.trim() || null,
			name: profile ? displayNameFromProfile(profile) : "未建档",
			email,
			role: profile?.role ?? null,
			isCoach: Boolean(profile?.is_coach),
			isSeed: isSeedAccountEmail(email, SUPER_USER_EMAILS),
			isAdmin: Boolean(admin),
			adminRole: admin?.role ?? null,
			isSuperUser: isSuperUserEmail(email),
		});
	}
	return out;
}
