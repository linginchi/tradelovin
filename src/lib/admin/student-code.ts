import type { SupabaseClient } from "@supabase/supabase-js";

/** 课程报读审批发放：BD0001 … BD9999（历史规则，继续有效）。 */
export const COURSE_STUDENT_PREFIX = "BD";

/** 平台会员学号：TL + 公历年后两位 + 4 位流水，如 TL260001。 */
export const PLATFORM_STUDENT_PREFIX = "TL";

export function formatBdStudentId(seq: number): string {
	if (!Number.isInteger(seq) || seq < 1 || seq > 9999) {
		throw new Error("Student ID sequence overflow");
	}
	return `${COURSE_STUDENT_PREFIX}${String(seq).padStart(4, "0")}`;
}

export function formatPlatformStudentId(year: number, seq: number): string {
	if (!Number.isInteger(seq) || seq < 1 || seq > 9999) {
		throw new Error("Student ID sequence overflow");
	}
	const yy = String(((year % 100) + 100) % 100).padStart(2, "0");
	return `${PLATFORM_STUDENT_PREFIX}${yy}${String(seq).padStart(4, "0")}`;
}

export function nextBdSeq(existing: Array<string | null | undefined>): number {
	let max = 0;
	const re = /^BD(\d+)$/i;
	for (const sid of existing) {
		const m = re.exec(String(sid ?? "").trim());
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	const next = max + 1;
	if (next > 9999) throw new Error("Student ID sequence overflow");
	return next;
}

export function nextPlatformSeq(existing: Array<string | null | undefined>, year: number): number {
	const prefix = `${PLATFORM_STUDENT_PREFIX}${String(((year % 100) + 100) % 100).padStart(2, "0")}`;
	const re = new RegExp(`^${prefix}(\\d{4})$`, "i");
	let max = 0;
	for (const sid of existing) {
		const m = re.exec(String(sid ?? "").trim());
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	const next = max + 1;
	if (next > 9999) throw new Error("Student ID sequence overflow");
	return next;
}

/** 生成下一个课程报读学号 BD0001 … BD9999 */
export async function nextBdStudentId(supabase: SupabaseClient): Promise<string> {
	const { data, error } = await supabase.from("profiles").select("student_id").like("student_id", "BD%");
	if (error) throw new Error(error.message);
	return formatBdStudentId(nextBdSeq((data ?? []).map((row) => row.student_id as string | null)));
}

export async function nextPlatformStudentId(supabase: SupabaseClient, now = new Date()): Promise<string> {
	const year = now.getFullYear();
	const prefix = `${PLATFORM_STUDENT_PREFIX}${String(year % 100).padStart(2, "0")}`;
	const { data, error } = await supabase.from("profiles").select("student_id").like("student_id", `${prefix}%`);
	if (error) throw new Error(error.message);
	return formatPlatformStudentId(year, nextPlatformSeq((data ?? []).map((row) => row.student_id as string | null), year));
}

export async function assignMissingPlatformStudentIds(
	supabase: SupabaseClient,
	userIds: string[],
	now = new Date(),
): Promise<{ assigned: number; codes: Record<string, string> }> {
	const unique = [...new Set(userIds.filter(Boolean))];
	if (unique.length === 0) return { assigned: 0, codes: {} };

	const { data, error } = await supabase.from("profiles").select("id, student_id").in("id", unique);
	if (error) throw new Error(error.message);

	const missing = (data ?? []).filter((row) => !String((row as { student_id?: string | null }).student_id ?? "").trim());
	const codes: Record<string, string> = {};
	for (const row of data ?? []) {
		const sid = String((row as { student_id?: string | null }).student_id ?? "").trim();
		if (sid) codes[(row as { id: string }).id] = sid;
	}
	if (missing.length === 0) return { assigned: 0, codes };

	let assigned = 0;
	for (const row of missing) {
		const id = (row as { id: string }).id;
		const studentId = await nextPlatformStudentId(supabase, now);
		const { error: updErr } = await supabase.from("profiles").update({ student_id: studentId }).eq("id", id);
		if (updErr) throw new Error(updErr.message);
		codes[id] = studentId;
		assigned += 1;
	}
	return { assigned, codes };
}
