import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import {
	fetchLabProviderHealth,
	getLabActiveModel,
	isModelSelectable,
	setLabActiveModel,
} from "@/lib/lab/config";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type PutBody = {
	provider?: string;
	modelId?: string;
};

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 503 });

	const [active, providers] = await Promise.all([getLabActiveModel(srv), fetchLabProviderHealth()]);
	return NextResponse.json({ success: true, active, providers });
}

export async function PUT(request: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 503 });

	let body: PutBody;
	try {
		body = (await request.json()) as PutBody;
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const provider = body.provider === "volcano" ? "volcano" : null;
	const modelId = String(body.modelId ?? "").trim();
	if (!provider || !modelId) {
		return NextResponse.json({ success: false, error: "缺少 provider 或 modelId" }, { status: 400 });
	}

	const providers = await fetchLabProviderHealth();
	const health = providers.find((p) => p.id === provider);
	if (!isModelSelectable(health, modelId)) {
		return NextResponse.json(
			{
				success: false,
				error: health?.reason
					? `无法切换：${health.reason}`
					: "该模型未在健康检查的视觉可用列表中",
			},
			{ status: 400 },
		);
	}

	try {
		await setLabActiveModel(srv, { provider, modelId }, null);
		const active = await getLabActiveModel(srv);
		return NextResponse.json({ success: true, active, providers });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
