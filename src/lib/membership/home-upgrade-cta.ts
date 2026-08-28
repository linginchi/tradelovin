import type { PaidPlan } from "@/lib/billing/stripe";
import type { UserPlan } from "@/lib/membership/v2";
import { getNextPaidPlan } from "@/lib/membership/upgrade-rules";

export type HomeUpgradeCta = {
	visible: boolean;
	href: string;
	nextPlan: PaidPlan | null;
};

export function resolveHomeUpgradeCta(input: {
	isAuthed: boolean;
	plan: UserPlan | null;
}): HomeUpgradeCta {
	if (!input.isAuthed) {
		return { visible: true, href: "/login?next=/membership", nextPlan: null };
	}
	if (!input.plan) {
		return { visible: true, href: "/membership", nextPlan: null };
	}
	const nextPlan = getNextPaidPlan(input.plan);
	if (!nextPlan) {
		return { visible: false, href: "/membership", nextPlan: null };
	}
	return {
		visible: true,
		href: `/membership?plan=${nextPlan}`,
		nextPlan,
	};
}
