import { NextResponse } from "next/server";

import { requireCoachDesk } from "@/lib/coach/guard";
import {
	attachRequestNames,
	ensureCoachInventoryForGrant,
	grantCoachQuotaWithRecord,
	grantCoachResource,
	listCoachRequests,
	markResourceRequestReviewed,
} from "@/lib/coach/service";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import type { ResourceSide } from "@/lib/trade-v2/resources";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireCoachDesk();
	if (ctx instanceof NextResponse) return ctx;
	try {
		const rows = await listCoachRequests(ctx.service, ctx.userId);
		const data = await attachRequestNames(ctx.service, rows);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取申请失败" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const ctx = await requireCoachDesk();
	if (ctx instanceof NextResponse) return ctx;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
	const requestId = typeof rec.requestId === "string" ? rec.requestId : "";
	const action = rec.action === "reject" ? "reject" : rec.action === "approve" ? "approve" : "";
	const rejectReason = typeof rec.rejectReason === "string" ? rec.rejectReason.trim().slice(0, 200) : "";
	if (!requestId || !action) {
		return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
	}
	try {
		const { data: row, error } = await ctx.service
			.from("tq_resource_requests")
			.select("*")
			.eq("id", requestId)
			.eq("coach_id", ctx.userId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!row) {
			return NextResponse.json({ success: false, error: "申请不存在" }, { status: 404 });
		}
		if ((row as { status?: string }).status !== "pending") {
			return NextResponse.json({ success: false, error: "该申请已处理" }, { status: 400 });
		}
		if (action === "reject") {
			await markResourceRequestReviewed(ctx.service, requestId, {
				status: "rejected",
				reviewedBy: ctx.userId,
				rejectReason,
			});
			return NextResponse.json({ success: true });
		}
		const side = (row as { side: ResourceSide }).side;
		const symbol = (row as { symbol: string }).symbol;
		const quantity = Number((row as { quantity: number }).quantity);
		await ensureCoachInventoryForGrant(ctx.service, ctx.userId, symbol, side, quantity);
		await grantCoachResource(
			ctx.service,
			ctx.userId,
			(row as { student_id: string }).student_id,
			symbol,
			side,
			quantity,
		);
		await markResourceRequestReviewed(ctx.service, requestId, {
			status: "approved",
			reviewedBy: ctx.userId,
		});
		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "处理申请失败" },
			{ status: 400 },
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
	const studentId = typeof rec.studentId === "string" ? rec.studentId : "";
	const symbol = normalizeCnSymbol(typeof rec.symbol === "string" ? rec.symbol : "");
	const side: ResourceSide = rec.side === "short" ? "short" : "long";
	const quantity = Number(rec.quantity);
	if (!studentId || !isCanonicalCnSymbol(symbol) || !Number.isInteger(quantity) || quantity <= 0) {
		return NextResponse.json({ success: false, error: "请填写学员、合法标的和正整数数量" }, { status: 400 });
	}
	try {
		const data = await grantCoachQuotaWithRecord(ctx.service, {
			coachId: ctx.userId,
			studentId,
			symbol,
			side,
			quantity,
		});
		return NextResponse.json({ success: true, data: data ?? null });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "发放失败" },
			{ status: 400 },
		);
	}
}
