import { NextResponse } from "next/server";

import { assertDojoServerKey, exchangeLabAuthCode } from "@/lib/lab/sso";

export const runtime = "nodejs";

type Body = { code?: string };

/** Dojo 服务端：用授权码兑换短 session JWT（需 LAB_DOJO_SERVER_KEY） */
export async function POST(request: Request) {
	if (!assertDojoServerKey(request.headers.get("authorization"))) {
		return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const code = String(body.code ?? "").trim();
	if (!code) {
		return NextResponse.json({ success: false, error: "缺少 code" }, { status: 400 });
	}

	try {
		const exchanged = await exchangeLabAuthCode(code);
		return NextResponse.json({
			success: true,
			sessionToken: exchanged.sessionToken,
			expiresIn: exchanged.expiresIn,
			userId: exchanged.userId,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ success: false, error: message }, { status: 400 });
	}
}
