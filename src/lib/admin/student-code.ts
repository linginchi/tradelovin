import type { SupabaseClient } from "@supabase/supabase-js";

/** 生成下一个学号 BD0001 … BD9999 */
export async function nextBdStudentId(supabase: SupabaseClient): Promise<string> {
	const { data, error } = await supabase.from("profiles").select("student_id").like("student_id", "BD%");
	if (error) throw new Error(error.message);

	let max = 0;
	for (const row of data ?? []) {
		const sid = row.student_id as string;
		const m = /^BD(\d+)$/i.exec(sid);
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	const next = max + 1;
	if (next > 9999) throw new Error("Student ID sequence overflow");
	return `BD${String(next).padStart(4, "0")}`;
}
