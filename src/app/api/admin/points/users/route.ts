import { NextResponse } from "next/server";

import { loadAdminUserDirectory } from "@/lib/admin/user-directory";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	const { data, error } = await srv
		.from("user_points")
		.select("user_id,balance,total_earned,total_spent,updated_at")
		.order("updated_at", { ascending: false })
		.limit(500);
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
				return {
					user_id: row.user_id,
					balance: row.balance,
					total_earned: row.total_earned,
					total_spent: row.total_spent,
					updated_at: row.updated_at,
					student_id: user?.studentId ?? null,
					name: user?.name ?? "未建档",
					email: user?.email ?? null,
					is_seed: user?.isSeed ?? false,
					is_admin: user?.isAdmin ?? false,
				};
			}),
		});
	} catch (err) {
		return NextResponse.json(
			{ success: false, error: err instanceof Error ? err.message : "读取积分用户失败" },
			{ status: 500 },
		);
	}
}
