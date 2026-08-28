import { NextResponse } from "next/server";

import { loadAssessmentDashboard } from "@/lib/assessment/load-dashboard";
import type { AssessmentModule } from "@/lib/assessment/types";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

function readModule(raw: string | null): AssessmentModule | null {
	if (raw === "t0" || raw === "lab") return raw;
	return null;
}

export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const module = readModule(new URL(request.url).searchParams.get("module"));
	if (!module) {
		return NextResponse.json({ success: false, error: "module 须为 t0 或 lab" }, { status: 400 });
	}

	try {
		const dashboard = await loadAssessmentDashboard(auth.supabase, auth.userId, module);
		return NextResponse.json({ success: true, dashboard });
	} catch (error) {
		const message = error instanceof Error ? error.message : "加载考核仪表失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
