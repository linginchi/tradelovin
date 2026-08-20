import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
	parsePublicResourceSymbol,
	parsePublicResourceUpsert,
	personalQuotaBlocksDelete,
} from "@/lib/trade-v2/admin-public-resources";
import { listPublicResources } from "@/lib/trade-v2/resources";

export const runtime = "nodejs";

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	try {
		const data = await listPublicResources(srv);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取公共资源失败" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = parsePublicResourceUpsert(body);
	if (!parsed.ok) {
		return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
	}

	const { error } = await srv.from("tq_public_resources").upsert(
		{
			symbol: parsed.data.symbol,
			name: parsed.data.name,
			long_limit: parsed.data.long_limit,
			short_limit: parsed.data.short_limit,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "symbol" },
	);
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 400 });
	}

	return NextResponse.json({ success: true, data: parsed.data });
}

export async function DELETE(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	const url = new URL(request.url);
	const parsed = parsePublicResourceSymbol(url.searchParams.get("symbol"));
	if (!parsed.ok) {
		return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
	}

	const [{ data: personalRows, error: personalErr }, { data: dynamicRows, error: dynamicErr }] =
		await Promise.all([
			srv
				.from("tq_user_resources")
				.select("long_quota, short_quota")
				.eq("symbol", parsed.symbol),
			srv.from("tq_dynamic_resources").select("quantity").eq("symbol", parsed.symbol),
		]);
	if (personalErr) {
		return NextResponse.json({ success: false, error: personalErr.message }, { status: 400 });
	}
	if (dynamicErr) {
		return NextResponse.json({ success: false, error: dynamicErr.message }, { status: 400 });
	}

	const dynamicSum = (dynamicRows ?? []).reduce(
		(sum, row) => sum + Number((row as { quantity?: number }).quantity ?? 0),
		0,
	);
	if (personalQuotaBlocksDelete(personalRows ?? [], dynamicSum)) {
		return NextResponse.json(
			{
				success: false,
				error: "该标的仍有学员占用个人额度。下一步：先让学员在交易页退回额度后再删除。",
			},
			{ status: 400 },
		);
	}

	const { error } = await srv.from("tq_public_resources").delete().eq("symbol", parsed.symbol);
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 400 });
	}

	return NextResponse.json({ success: true });
}
