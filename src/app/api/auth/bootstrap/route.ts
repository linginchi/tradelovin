import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	nickname?: unknown;
	real_name?: unknown;
	phone?: unknown;
};

/**
 * 第一关收尾：OTP 已通过，创建/更新 profiles 与默认 sim_accounts。
 */
export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json(
			{ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" },
			{ status: 503 },
		);
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
	if (!nickname) {
		return NextResponse.json({ success: false, error: "请填写昵称" }, { status: 400 });
	}

	const { supabase } = auth;
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email) {
		return NextResponse.json({ success: false, error: "无法读取登录邮箱" }, { status: 400 });
	}

	const realName = typeof body.real_name === "string" ? body.real_name.trim() : "";
	const phone = typeof body.phone === "string" ? body.phone.trim() : "";

	const { error: pErr } = await srv.from("profiles").upsert(
		{
			id: user.id,
			nickname,
			real_name: realName || null,
			phone: phone || null,
			role: "user",
		},
		{ onConflict: "id" },
	);

	if (pErr) {
		console.error("[bootstrap profiles]", pErr);
		return NextResponse.json({ success: false, error: pErr.message }, { status: 500 });
	}

	const gc = await getOrCreateSimAccount(srv, user.id);
	if (gc.error || !gc.data) {
		return NextResponse.json(
			{ success: false, error: gc.error?.message ?? "初始化模拟账户失败" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ success: true, data: { profileId: user.id } });
}
