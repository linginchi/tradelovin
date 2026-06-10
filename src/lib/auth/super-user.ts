import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthEmailByUserId } from "@/lib/auth/profile-resolve";
import type { CurrentMembership } from "@/lib/membership/v2";

/** 硬编码超级用户白名单（绕过会员/试用/课程付费门槛）。 */
export const SUPER_USER_EMAILS = [
	"549516157@qq.com",
	"william.hu@hkcas.org",
	"lin@hkcas.org",
] as const;

export type SuperUserEmail = (typeof SUPER_USER_EMAILS)[number];

export function isSuperUserEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	const lower = email.trim().toLowerCase();
	return (SUPER_USER_EMAILS as readonly string[]).includes(lower);
}

export async function isSuperUserById(srv: SupabaseClient, userId: string): Promise<boolean> {
	const email = await getAuthEmailByUserId(srv, userId);
	return isSuperUserEmail(email);
}

export function buildSuperUserCurrentMembership(userId: string): CurrentMembership {
	const now = new Date();
	const farFuture = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
	const iso = now.toISOString();
	const endIso = farFuture.toISOString();
	return {
		id: `super-${userId}`,
		userId,
		plan: "T3",
		status: "active",
		trialEnd: null,
		currentPeriodStart: iso,
		currentPeriodEnd: endIso,
		cancelAtPeriodEnd: false,
		stripeSubscriptionId: null,
		stripeCustomerId: null,
		billingCycle: null,
		graceStartedAt: null,
		createdAt: iso,
		updatedAt: iso,
	};
}
