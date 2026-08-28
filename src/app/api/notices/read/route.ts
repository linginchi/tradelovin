import { NextResponse } from "next/server";

import { markNoticesReadForUser } from "@/lib/notices/store";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type MarkReadBody = {
	ids?: unknown;
	all?: unknown;
};

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	let body: MarkReadBody;
	try {
		body = (await request.json()) as MarkReadBody;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	try {
		if (body.all === true) {
			await markNoticesReadForUser(ctx.supabase, ctx.userId, "all");
		} else {
			const ids = Array.isArray(body.ids)
				? body.ids.filter((value): value is string => typeof value === "string" && value.length > 0)
				: [];
			await markNoticesReadForUser(ctx.supabase, ctx.userId, ids);
		}
		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "标记已读失败" },
			{ status: 500 },
		);
	}
}
