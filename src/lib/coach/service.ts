import type { SupabaseClient } from "@supabase/supabase-js";

import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import type { ResourceSide } from "@/lib/trade-v2/resources";
import {
	type CoachInventoryRow,
	type CoachPublicProfile,
	type CoachStudentRow,
	type ResourceRequestRow,
	displayNameFromProfile,
	GOLDEN_LEOPARD_COACH_BADGE,
} from "@/lib/coach/types";

export async function listCoachDirectory(service: SupabaseClient): Promise<CoachPublicProfile[]> {
	const { data, error } = await service
		.from("profiles")
		.select("id, real_name, nickname")
		.eq("is_coach", true)
		.order("real_name", { ascending: true });
	if (error) throw new Error(error.message);
	return ((data ?? []) as Array<{ id: string; real_name: string | null; nickname: string | null }>).map((row) => ({
		id: row.id,
		name: displayNameFromProfile(row),
		badge: GOLDEN_LEOPARD_COACH_BADGE,
	}));
}

export async function getStudentBinding(
	service: SupabaseClient,
	studentId: string,
): Promise<CoachStudentRow | null> {
	const { data, error } = await service
		.from("coach_students")
		.select("*")
		.eq("student_id", studentId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return (data as CoachStudentRow | null) ?? null;
}

export async function listCoachInventory(
	service: SupabaseClient,
	coachId: string,
): Promise<CoachInventoryRow[]> {
	const { data, error } = await service
		.from("tq_coach_resources")
		.select("*")
		.eq("coach_id", coachId)
		.order("symbol", { ascending: true });
	if (error) throw new Error(error.message);
	return (data ?? []) as CoachInventoryRow[];
}

export async function upsertCoachInventory(
	service: SupabaseClient,
	coachId: string,
	input: { symbol: string; name?: string | null; long_limit: number; short_limit: number },
): Promise<void> {
	const symbol = normalizeCnSymbol(input.symbol);
	if (!isCanonicalCnSymbol(symbol)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	if (!Number.isInteger(input.long_limit) || input.long_limit < 0) {
		throw new Error("long_limit 必须为非负整数");
	}
	if (!Number.isInteger(input.short_limit) || input.short_limit < 0) {
		throw new Error("short_limit 必须为非负整数");
	}
	const name = input.name?.trim() ? input.name.trim().slice(0, 80) : null;
	const { error } = await service.from("tq_coach_resources").upsert(
		{
			coach_id: coachId,
			symbol,
			name,
			long_limit: input.long_limit,
			short_limit: input.short_limit,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "coach_id,symbol" },
	);
	if (error) throw new Error(error.message);
}

export async function listCoachStudents(
	service: SupabaseClient,
	coachId: string,
): Promise<CoachStudentRow[]> {
	const { data, error } = await service
		.from("coach_students")
		.select("*")
		.eq("coach_id", coachId)
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return (data ?? []) as CoachStudentRow[];
}

export async function attachStudentNames(
	service: SupabaseClient,
	rows: CoachStudentRow[],
): Promise<Array<CoachStudentRow & { student_name: string }>> {
	if (rows.length === 0) return [];
	const ids = [...new Set(rows.map((row) => row.student_id))];
	const { data, error } = await service.from("profiles").select("id, real_name, nickname").in("id", ids);
	if (error) throw new Error(error.message);
	const nameMap = new Map(
		((data ?? []) as Array<{ id: string; real_name: string | null; nickname?: string | null }>).map((row) => [
			row.id,
			displayNameFromProfile(row),
		]),
	);
	return rows.map((row) => ({
		...row,
		student_name: nameMap.get(row.student_id) ?? "学员",
	}));
}

export async function listCoachRequests(
	service: SupabaseClient,
	coachId: string,
	status?: ResourceRequestRow["status"],
): Promise<ResourceRequestRow[]> {
	let query = service
		.from("tq_resource_requests")
		.select("*")
		.eq("coach_id", coachId)
		.order("created_at", { ascending: false });
	if (status) query = query.eq("status", status);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? []) as ResourceRequestRow[];
}

export async function listStudentRequests(
	service: SupabaseClient,
	studentId: string,
): Promise<ResourceRequestRow[]> {
	const { data, error } = await service
		.from("tq_resource_requests")
		.select("*")
		.eq("student_id", studentId)
		.order("created_at", { ascending: false })
		.limit(20);
	if (error) throw new Error(error.message);
	return (data ?? []) as ResourceRequestRow[];
}

export async function createResourceRequest(
	service: SupabaseClient,
	input: {
		studentId: string;
		coachId: string;
		symbol: string;
		side: ResourceSide;
		quantity: number;
	},
): Promise<ResourceRequestRow> {
	const symbol = normalizeCnSymbol(input.symbol);
	if (!isCanonicalCnSymbol(symbol)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
		throw new Error("申请数量必须为正整数");
	}

	const { data: existingPending, error: pendingErr } = await service
		.from("tq_resource_requests")
		.select("id")
		.eq("student_id", input.studentId)
		.eq("symbol", symbol)
		.eq("side", input.side)
		.eq("status", "pending")
		.maybeSingle();
	if (pendingErr) throw new Error(pendingErr.message);
	if (existingPending) {
		throw new Error("该标的已有审核中的申请。下一步：等待教练在考核盘资源栏批准，或请教练拒绝后再重新申请。");
	}

	const { data, error } = await service
		.from("tq_resource_requests")
		.insert({
			student_id: input.studentId,
			coach_id: input.coachId,
			symbol,
			side: input.side,
			quantity: input.quantity,
			status: "pending",
		})
		.select("*")
		.single();
	if (error) throw new Error(error.message);
	return data as ResourceRequestRow;
}

export async function ensureCoachInventoryForGrant(
	service: SupabaseClient,
	coachId: string,
	symbol: string,
	side: ResourceSide,
	quantity: number,
): Promise<void> {
	const normalized = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalized)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	if (!Number.isInteger(quantity) || quantity <= 0) {
		throw new Error("quantity 必须为正整数");
	}
	const { data, error } = await service
		.from("tq_coach_resources")
		.select("id, long_limit, short_limit, name")
		.eq("coach_id", coachId)
		.eq("symbol", normalized)
		.maybeSingle();
	if (error) throw new Error(error.message);
	const currentLong = Number((data as { long_limit?: number } | null)?.long_limit ?? 0);
	const currentShort = Number((data as { short_limit?: number } | null)?.short_limit ?? 0);
	const long_limit = side === "long" ? Math.max(currentLong, quantity) : currentLong;
	const short_limit = side === "short" ? Math.max(currentShort, quantity) : currentShort;
	await upsertCoachInventory(service, coachId, {
		symbol: normalized,
		name: ((data as { name?: string | null } | null)?.name ?? normalized) || normalized,
		long_limit,
		short_limit,
	});
}

export async function markResourceRequestReviewed(
	service: SupabaseClient,
	requestId: string,
	input: {
		status: "approved" | "rejected";
		reviewedBy: string;
		rejectReason?: string | null;
	},
): Promise<void> {
	const { error } = await service
		.from("tq_resource_requests")
		.update({
			status: input.status,
			reviewed_by: input.reviewedBy,
			reject_reason: input.status === "rejected" ? input.rejectReason || "教练已拒绝" : null,
			reviewed_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("id", requestId);
	if (error) throw new Error(error.message);
}

export async function recordDirectGrant(
	service: SupabaseClient,
	input: {
		coachId: string;
		studentId: string;
		symbol: string;
		side: ResourceSide;
		quantity: number;
		reviewedBy: string;
	},
): Promise<void> {
	const symbol = normalizeCnSymbol(input.symbol);
	const { error } = await service.from("tq_resource_requests").insert({
		student_id: input.studentId,
		coach_id: input.coachId,
		symbol,
		side: input.side,
		quantity: input.quantity,
		status: "approved",
		reviewed_by: input.reviewedBy,
		reviewed_at: new Date().toISOString(),
	});
	if (error) throw new Error(error.message);
}

export async function attachRequestNames(
	service: SupabaseClient,
	rows: ResourceRequestRow[],
): Promise<Array<ResourceRequestRow & { student_name: string; reviewed_by_name: string | null }>> {
	if (rows.length === 0) return [];
	const ids = [
		...new Set(rows.flatMap((row) => [row.student_id, row.reviewed_by].filter((id): id is string => Boolean(id)))),
	];
	const { data, error } = await service.from("profiles").select("id, real_name, nickname").in("id", ids);
	if (error) throw new Error(error.message);
	const nameMap = new Map(
		((data ?? []) as Array<{ id: string; real_name: string | null; nickname: string | null }>).map((row) => [
			row.id,
			displayNameFromProfile(row),
		]),
	);
	return rows.map((row) => ({
		...row,
		student_name: nameMap.get(row.student_id) ?? "学员",
		reviewed_by_name: row.reviewed_by ? nameMap.get(row.reviewed_by) ?? "教练" : null,
	}));
}

export async function grantCoachResource(
	service: SupabaseClient,
	coachId: string,
	studentId: string,
	symbol: string,
	side: ResourceSide,
	quantity: number,
) {
	const normalized = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalized)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	const { data, error } = await service.rpc("tq_coach_grant_resource", {
		p_coach_id: coachId,
		p_student_id: studentId,
		p_symbol: normalized,
		p_side: side,
		p_quantity: quantity,
	});
	if (error) throw new Error(error.message);
	return data;
}

export async function grantCoachQuotaWithRecord(
	service: SupabaseClient,
	input: {
		coachId: string;
		studentId: string;
		symbol: string;
		side: ResourceSide;
		quantity: number;
	},
) {
	await ensureCoachInventoryForGrant(service, input.coachId, input.symbol, input.side, input.quantity);
	const data = await grantCoachResource(
		service,
		input.coachId,
		input.studentId,
		input.symbol,
		input.side,
		input.quantity,
	);
	await recordDirectGrant(service, {
		coachId: input.coachId,
		studentId: input.studentId,
		symbol: input.symbol,
		side: input.side,
		quantity: input.quantity,
		reviewedBy: input.coachId,
	});
	return data;
}

export async function returnToCoachPool(
	service: SupabaseClient,
	studentId: string,
	symbol: string,
	side: ResourceSide,
	quantity: number,
) {
	const normalized = normalizeCnSymbol(symbol);
	if (!isCanonicalCnSymbol(normalized)) throw new Error(SYMBOL_FORMAT_ERROR_MESSAGE);
	const { data, error } = await service.rpc("tq_coach_return_resource", {
		p_student_id: studentId,
		p_symbol: normalized,
		p_side: side,
		p_quantity: quantity,
	});
	if (error) throw new Error(error.message);
	return data;
}

export async function bindStudentToCoach(
	service: SupabaseClient,
	studentId: string,
	coachId: string,
): Promise<CoachStudentRow> {
	if (studentId === coachId) throw new Error("不能绑定自己为教练");
	const { data: coach, error: coachErr } = await service
		.from("profiles")
		.select("id, is_coach")
		.eq("id", coachId)
		.maybeSingle();
	if (coachErr) throw new Error(coachErr.message);
	if (!coach || !(coach as { is_coach?: boolean }).is_coach) {
		throw new Error("请选择已任命的金钱豹教练");
	}
	const existing = await getStudentBinding(service, studentId);
	if (existing?.status === "accepted") {
		if (existing.coach_id === coachId) return existing;
		throw new Error("你已绑定教练。下一步：请现任教练解除后再换绑。");
	}
	const { data, error } = await service
		.from("coach_students")
		.upsert(
			{
				coach_id: coachId,
				student_id: studentId,
				status: "pending",
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "student_id" },
		)
		.select("*")
		.single();
	if (error) throw new Error(error.message);
	return data as CoachStudentRow;
}

export async function acceptOrRejectBind(
	service: SupabaseClient,
	coachId: string,
	studentId: string,
	status: "accepted" | "rejected",
): Promise<void> {
	const { data, error } = await service
		.from("coach_students")
		.update({ status, updated_at: new Date().toISOString() })
		.eq("coach_id", coachId)
		.eq("student_id", studentId)
		.select("id")
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error("没有这条绑定申请");
}

export async function addStudentById(
	service: SupabaseClient,
	coachId: string,
	studentId: string,
): Promise<CoachStudentRow> {
	if (coachId === studentId) throw new Error("不能添加自己为学员");
	const existing = await getStudentBinding(service, studentId);
	if (existing && existing.coach_id !== coachId && existing.status !== "rejected") {
		throw new Error("该学员已绑定或正在申请其他教练");
	}
	const { data, error } = await service
		.from("coach_students")
		.upsert(
			{
				coach_id: coachId,
				student_id: studentId,
				status: "accepted",
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "student_id" },
		)
		.select("*")
		.single();
	if (error) throw new Error(error.message);
	return data as CoachStudentRow;
}
