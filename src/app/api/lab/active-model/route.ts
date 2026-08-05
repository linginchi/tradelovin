import { NextResponse } from "next/server";

import { getLabActiveModel } from "@/lib/lab/config";
import { assertDojoServerKey } from "@/lib/lab/sso";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Dojo 拉取当前启用模型（服务端密钥） */
export async function GET(request: Request) {
	if (!assertDojoServerKey(request.headers.get("authorization"))) {
		return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
	}
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	const active = await getLabActiveModel(srv);
	return NextResponse.json({ success: true, active });
}
