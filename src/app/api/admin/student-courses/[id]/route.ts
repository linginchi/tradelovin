import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		payment_status: z.enum(["paid", "unpaid", "refunded"]),
		refund_reason: z.string().nullable().optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

/** 按选课记录（student_courses.id）更新缴费状态与退款说明 */
export async function PATCH(req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	if (parsed.data.payment_status === "refunded" && !parsed.data.refund_reason?.trim()) {
		return NextResponse.json({ error: "refund_reason required for refunded status" }, { status: 400 });
	}

	const rowUpdates: Record<string, unknown> = {
		payment_status: parsed.data.payment_status,
	};
	if (parsed.data.payment_status === "refunded") {
		rowUpdates.refund_reason = parsed.data.refund_reason?.trim() ?? null;
	} else {
		rowUpdates.refund_reason = null;
	}

	const { error } = await supabase.from("student_courses").update(rowUpdates).eq("id", id);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
