import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { loadAdminUserDirectory } from "@/lib/admin/user-directory";
import { getDisplayLevel } from "@/lib/membership/level-mapping";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	const url = new URL(request.url);
	const plan = url.searchParams.get("plan");
	const status = url.searchParams.get("status");

	let query = srv
		.from("user_memberships")
		.select("id,user_id,plan,status,current_period_end,cancel_at_period_end,updated_at")
		.order("updated_at", { ascending: false })
		.limit(500);
	if (plan) query = query.eq("plan", plan);
	if (status) query = query.eq("status", status);

	const { data, error } = await query;
	if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

	const rows = data ?? [];
	try {
		const directory = await loadAdminUserDirectory(
			srv,
			rows.map((row) => row.user_id as string),
		);
		return NextResponse.json({
			success: true,
			data: rows.map((row) => {
				const user = directory.get(row.user_id as string);
				const level = getDisplayLevel(String(row.plan ?? ""));
				return {
					id: row.id,
					user_id: row.user_id,
					plan: row.plan,
					status: row.status,
					current_period_end: row.current_period_end,
					cancel_at_period_end: row.cancel_at_period_end,
					student_id: user?.studentId ?? null,
					name: user?.name ?? "未建档",
					email: user?.email ?? null,
					level_code: level.code,
					level_label: `${level.code} · ${level.nameZh}`,
					is_seed: user?.isSeed ?? false,
					is_admin: user?.isAdmin ?? false,
					admin_role: user?.adminRole ?? null,
					is_super_user: user?.isSuperUser ?? false,
					is_coach: user?.isCoach ?? false,
				};
			}),
		});
	} catch (err) {
		return NextResponse.json(
			{ success: false, error: err instanceof Error ? err.message : "读取会员资料失败" },
			{ status: 500 },
		);
	}
}
