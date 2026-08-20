import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getAuthEmailByUserId, getTradeUserIdByEmail } from "@/lib/auth/profile-resolve";
import { requireCoachDesk } from "@/lib/coach/guard";
import { acceptOrRejectBind, addStudentById, listCoachStudents } from "@/lib/coach/service";
import { displayNameFromProfile, type CoachStudentRow } from "@/lib/coach/types";

export const runtime = "nodejs";

async function withNames(service: SupabaseClient, rows: CoachStudentRow[]) {
	if (rows.length === 0) return [];
	const ids = [...new Set(rows.map((row) => row.student_id))];
	const { data, error } = await service.from("profiles").select("id, real_name, nickname").in("id", ids);
	if (error) throw new Error(error.message);
	const nameMap = new Map(
		((data ?? []) as Array<{ id: string; real_name: string | null; nickname: string | null }>).map((row) => [
			row.id,
			displayNameFromProfile(row),
		]),
	);
	const withEmail = [];
	for (const row of rows) {
		const email = await getAuthEmailByUserId(service, row.student_id);
		withEmail.push({
			...row,
			student_name: nameMap.get(row.student_id) ?? "学员",
			student_email: email,
		});
	}
	return withEmail;
}

export async function GET() {
	const ctx = await requireCoachDesk();
	if (ctx instanceof NextResponse) return ctx;
	try {
		const rows = await listCoachStudents(ctx.service, ctx.userId);
		const data = await withNames(ctx.service, rows);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取学员失败" },
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
	const email = typeof rec.email === "string" ? rec.email.trim().toLowerCase() : "";
	if (!email) {
		return NextResponse.json({ success: false, error: "请填写学员邮箱" }, { status: 400 });
	}
	try {
		const studentId = await getTradeUserIdByEmail(ctx.service, email);
		if (!studentId) {
			return NextResponse.json({ success: false, error: "找不到该邮箱对应的学员账号" }, { status: 404 });
		}
		await addStudentById(ctx.service, ctx.userId, studentId);
		const rows = await listCoachStudents(ctx.service, ctx.userId);
		const data = await withNames(ctx.service, rows);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "添加学员失败" },
			{ status: 400 },
		);
	}
}

export async function PATCH(request: Request) {
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
	const status = rec.status === "rejected" ? "rejected" : rec.status === "accepted" ? "accepted" : "";
	if (!studentId || !status) {
		return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
	}
	try {
		await acceptOrRejectBind(ctx.service, ctx.userId, studentId, status);
		const rows = await listCoachStudents(ctx.service, ctx.userId);
		const data = await withNames(ctx.service, rows);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "更新绑定失败" },
			{ status: 400 },
		);
	}
}
