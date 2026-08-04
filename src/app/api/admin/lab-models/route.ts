import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { fetchLabProviderHealth } from "@/lib/lab/config";

export const runtime = "nodejs";

/** 代理 Dojo /health/models（不可达时返回未配置占位） */
export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const providers = await fetchLabProviderHealth();
	return NextResponse.json({ success: true, providers });
}
