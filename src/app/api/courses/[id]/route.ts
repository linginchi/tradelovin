import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
	const { id } = await params;
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await srv
		.from("courses")
		.select(
			"id,title,description,cover_image,instructor_label,mode,start_date,end_date,location,capacity,price,is_active,created_at,instructor_id",
		)
		.eq("id", id)
		.eq("is_active", true)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ course: data });
}
