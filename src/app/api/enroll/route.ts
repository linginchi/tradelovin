import { NextResponse } from "next/server";

import { getTradeNicknameAndEmail } from "@/lib/auth/profile-resolve";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	real_name?: unknown;
	phone?: unknown;
	trading_experience?: unknown;
	trading_style_preferences?: unknown;
	learning_goals?: unknown;
	willing_to_recommend?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	if (!user) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

	const display = await getTradeNicknameAndEmail(srv, user.id, user.email ?? undefined);
	if (!display) {
		return NextResponse.json({ success: false, error: "请先完成注册并建档" }, { status: 400 });
	}

	const tradingExp = typeof body.trading_experience === "string" ? body.trading_experience : "";
	const styles = Array.isArray(body.trading_style_preferences)
		? body.trading_style_preferences.filter((x) => typeof x === "string")
		: [];
	const learningGoals = typeof body.learning_goals === "string" ? body.learning_goals.trim() || null : null;
	const reco =
		typeof body.willing_to_recommend === "boolean"
			? body.willing_to_recommend
			: body.willing_to_recommend === "yes";

	const row = {
		user_id: user.id,
		email: display.email,
		nickname: display.nickname,
		real_name: typeof body.real_name === "string" ? body.real_name.trim() || null : null,
		phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
		trading_experience: tradingExp || "none",
		trading_style_preferences: styles,
		learning_goals: learningGoals,
		willing_to_recommend: Boolean(reco),
		status: "pending" as const,
	};
	const rowUpdate = {
		email: row.email,
		nickname: row.nickname,
		real_name: row.real_name,
		phone: row.phone,
		trading_experience: row.trading_experience,
		trading_style_preferences: row.trading_style_preferences,
		learning_goals: row.learning_goals,
		willing_to_recommend: row.willing_to_recommend,
		status: row.status,
	};

	const ex = await srv.from("registrations").select("id").eq("user_id", user.id).maybeSingle();

	if ((ex.data as { id?: string })?.id) {
		const { error } = await srv.from("registrations").update(rowUpdate).eq("user_id", user.id);
		if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	} else {
		const { error } = await srv.from("registrations").insert(row);
		if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({ success: true, message: "报名已提交，请等待审核" });
}
