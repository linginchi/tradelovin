import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
	return NextResponse.json({
		success: false,
		error: "该接口已下线，请改用 /api/tq/score",
		migration: "/api/tq/score?env=sim&period=all",
	}, { status: 410 });
}
