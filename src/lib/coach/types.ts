export const GOLDEN_LEOPARD_COACH_BADGE = {
	id: "golden-leopard-coach",
	name: "P3 · 金钱豹教练",
	description: "可设置模拟盘库存、直接发放额度，并批准学员申请",
} as const;

export type CoachBindStatus = "none" | "pending" | "accepted" | "rejected";
export type ResourceRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type CoachResourceSide = "long" | "short";

export type CoachPublicProfile = {
	id: string;
	name: string;
	badge: typeof GOLDEN_LEOPARD_COACH_BADGE;
};

export type CoachInventoryRow = {
	id: string;
	coach_id: string;
	symbol: string;
	name: string | null;
	long_limit: number;
	short_limit: number;
	updated_at: string;
};

export type CoachStudentRow = {
	id: string;
	coach_id: string;
	student_id: string;
	status: "pending" | "accepted" | "rejected";
	created_at: string;
	updated_at: string;
	student_name?: string;
	student_email?: string | null;
};

export type ResourceRequestRow = {
	id: string;
	student_id: string;
	coach_id: string;
	symbol: string;
	side: CoachResourceSide;
	quantity: number;
	status: ResourceRequestStatus;
	reject_reason: string | null;
	reviewed_at: string | null;
	created_at: string;
	updated_at: string;
	student_name?: string;
};

export function displayNameFromProfile(row: {
	real_name?: string | null;
	nickname?: string | null;
}): string {
	return (row.real_name ?? row.nickname ?? "").trim() || "未命名";
}

export function isActiveT3Plan(plan: string | undefined, status: string | undefined, periodEnd: string | null | undefined): boolean {
	if (plan !== "T3") return false;
	if (status !== "active") return false;
	if (!periodEnd) return false;
	return new Date(periodEnd).getTime() >= Date.now();
}
