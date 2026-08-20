import { NextResponse } from "next/server";

import { requireCoachDesk } from "@/lib/coach/guard";
import { listCoachInventory, upsertCoachInventory } from "@/lib/coach/service";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireCoachDesk();
	if (ctx instanceof NextResponse) return ctx;
	try {
		const data = await listCoachInventory(ctx.service, ctx.userId);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取库存失败" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: Request) {
	const ctx = await requireCoachDesk();
	if (ctx instanceof NextResponse) return ctx;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
	const symbol = normalizeCnSymbol(typeof rec.symbol === "string" ? rec.symbol : "");
	if (!isCanonicalCnSymbol(symbol)) {
		return NextResponse.json({ success: false, error: "请输入合法 A 股代码" }, { status: 400 });
	}
	try {
		await upsertCoachInventory(ctx.service, ctx.userId, {
			symbol,
			name: typeof rec.name === "string" ? rec.name : null,
			long_limit: Number(rec.long_limit),
			short_limit: Number(rec.short_limit),
		});
		const data = await listCoachInventory(ctx.service, ctx.userId);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "保存库存失败" },
			{ status: 400 },
		);
	}
}
