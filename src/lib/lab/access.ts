export type LabAccessHint = {
	plan?: string;
	status?: string;
	currentPeriodEnd?: string | null;
};

/** 与服务端 lab_access 相同：仅 active 且未到期的 T2/T3 可进入。 */
export function canAccessLabFromHint(membership: LabAccessHint | null | undefined): boolean {
	if (!membership || (membership.plan !== "T2" && membership.plan !== "T3")) return false;
	if (membership.status !== "active") return false;

	const periodEnd = new Date(membership.currentPeriodEnd ?? "").getTime();
	return Number.isFinite(periodEnd) && periodEnd >= Date.now();
}
