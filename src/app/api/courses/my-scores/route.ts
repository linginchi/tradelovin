import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type ScoreRow = {
	score: number | null;
	grade: string | null;
	certificate_url: string | null;
	uploaded_at: string;
};

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	const { data, error } = await srv
		.from("course_registrations")
		.select(
			`
      id,
      status,
      courses ( id, title ),
      course_scores ( score, grade, certificate_url, uploaded_at )
    `,
		)
		.eq("user_id", user.id)
		.order("applied_at", { ascending: false });

	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	const scores = (data ?? []).map((row: Record<string, unknown>) => {
		const course = row.courses as { id: string; title: string } | null;
		const rawScores = row.course_scores as ScoreRow[] | null;
		const sorted = rawScores?.length
			? [...rawScores].sort(
					(a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
				)
			: [];
		const latest = sorted[0] ?? null;
		return {
			courseId: course?.id ?? "",
			courseTitle: course?.title ?? "",
			score: latest?.score ?? null,
			grade: latest?.grade ?? null,
			certificateUrl: latest?.certificate_url ?? null,
		};
	});

	return NextResponse.json({ success: true, scores });
}
