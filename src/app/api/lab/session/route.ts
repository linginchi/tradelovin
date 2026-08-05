import { NextResponse } from "next/server";

import { filterLabReport } from "@/lib/lab/compliance-filter";
import { assertDojoServerKey } from "@/lib/lab/sso";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type WriteBody = {
	userId?: string;
	sessionType?: string;
	inputSummary?: string;
	outputJson?: unknown;
	provider?: string;
	model?: string;
	tokens?: number;
	costCents?: number;
};

/** 学员：列出本人最近诊断记录 */
export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const membership = await requireMembershipCapability(auth.supabase, auth.userId, "lab_access");
	if (membership instanceof NextResponse) return membership;

	const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? "20");
	const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 20;

	const { data, error } = await auth.supabase
		.from("lab_sessions")
		.select("id,session_type,input_summary,output_json,provider,model,tokens,cost_cents,created_at")
		.eq("user_id", auth.userId)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({
		success: true,
		sessions: (data ?? []).map((row) => ({
			id: row.id,
			sessionType: row.session_type,
			inputSummary: row.input_summary,
			outputJson: row.output_json,
			provider: row.provider,
			model: row.model,
			tokens: row.tokens,
			costCents: row.cost_cents,
			createdAt: row.created_at,
		})),
	});
}

/** Dojo 回调：写入去标的化诊断（服务端密钥） */
export async function POST(request: Request) {
	if (!assertDojoServerKey(request.headers.get("authorization"))) {
		return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: WriteBody;
	try {
		body = (await request.json()) as WriteBody;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const userId = String(body.userId ?? "").trim();
	const provider = String(body.provider ?? "gemini").trim();
	const model = String(body.model ?? "").trim();
	if (!userId || !model) {
		return NextResponse.json({ success: false, error: "缺少 userId 或 model" }, { status: 400 });
	}
	if (provider !== "gemini" && provider !== "glm") {
		return NextResponse.json({ success: false, error: "非法 provider" }, { status: 400 });
	}

	// A valid VPS key identifies the caller, not the target account. Recheck the
	// account at write time so a revoked member cannot receive a new diagnosis.
	const membership = await requireMembershipCapability(srv, userId, "lab_access");
	if (membership instanceof NextResponse) return membership;

	const filtered = filterLabReport(body.outputJson);
	if (!filtered.ok) {
		return NextResponse.json({ success: false, error: filtered.reason }, { status: 422 });
	}

	const { data, error } = await srv
		.from("lab_sessions")
		.insert({
			user_id: userId,
			session_type: "diagnose",
			// This is rendered in history. Do not persist a caller-supplied summary,
			// which could reintroduce a ticker/name that the report filter removed.
			input_summary: "已上传组合截图",
			output_json: filtered.report,
			provider,
			model: model.slice(0, 120),
			tokens:
				typeof body.tokens === "number" && Number.isFinite(body.tokens)
					? Math.max(0, Math.floor(body.tokens))
					: null,
			cost_cents:
				typeof body.costCents === "number" && Number.isFinite(body.costCents)
					? Math.max(0, Math.floor(body.costCents))
					: null,
		})
		.select("id,created_at")
		.maybeSingle();

	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({
		success: true,
		id: data?.id,
		createdAt: data?.created_at,
	});
}
