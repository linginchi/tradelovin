import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
	DEFAULT_DIMENSION_WEIGHTS,
	DEFAULT_FEATURE_WEIGHTS,
	TQ_DIMENSIONS,
	TQ_FEATURES,
} from "@/lib/tq/constants";
import { getTqConfig } from "@/lib/tq/engine";

export const runtime = "nodejs";

type Body = {
	featureWeights?: unknown;
	dimensionWeights?: unknown;
};

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

function validateFeatureWeights(weights: unknown): boolean {
	if (!isObj(weights)) return false;
	for (const dim of TQ_DIMENSIONS) {
		const dimWeights = weights[dim];
		if (!isObj(dimWeights)) return false;
		for (const feature of TQ_FEATURES) {
			const val = Number(dimWeights[feature]);
			if (!Number.isFinite(val) || val < 0 || val > 1) return false;
		}
	}
	return true;
}

function validateDimensionWeights(weights: unknown): boolean {
	if (!isObj(weights)) return false;
	for (const dim of TQ_DIMENSIONS) {
		const val = Number(weights[dim]);
		if (!Number.isFinite(val) || val < 0 || val > 1) return false;
	}
	return true;
}

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	const config = await getTqConfig(srv);
	return NextResponse.json({
		success: true,
		config: {
			featureWeights: config.featureWeights ?? DEFAULT_FEATURE_WEIGHTS,
			dimensionWeights: config.dimensionWeights ?? DEFAULT_DIMENSION_WEIGHTS,
		},
	});
}

export async function PUT(request: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	if (!validateFeatureWeights(body.featureWeights) || !validateDimensionWeights(body.dimensionWeights)) {
		return NextResponse.json({ success: false, error: "权重格式不正确" }, { status: 400 });
	}
	await srv.from("tq_config").upsert(
		[
			{ key: "feature_weights", value: body.featureWeights },
			{ key: "dimension_weights", value: body.dimensionWeights },
		],
		{ onConflict: "key" },
	);
	return NextResponse.json({ success: true });
}
