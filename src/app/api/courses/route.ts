import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";

export const runtime = "nodejs";

export async function GET() {
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const baseSelect =
		"id,title,description,cover_image,instructor_label,mode,start_date,end_date,location,capacity,price,is_active,created_at";
	const withInstructorIdSelect = `${baseSelect},instructor_id`;

	let data: Record<string, unknown>[] | null = null;
	let error: { message: string } | null = null;

	const withIdRes = await srv
		.from("courses")
		.select(withInstructorIdSelect)
		.eq("is_active", true)
		.order("created_at", { ascending: false });
	if (withIdRes.error) {
		const fallbackRes = await srv
			.from("courses")
			.select(baseSelect)
			.eq("is_active", true)
			.order("created_at", { ascending: false });
		data = fallbackRes.data as Record<string, unknown>[] | null;
		error = fallbackRes.error;
	} else {
		data = withIdRes.data as Record<string, unknown>[] | null;
		error = withIdRes.error;
	}

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const rows: Record<string, unknown>[] = (data ?? []).map((row) => ({
		...row,
		instructor_id: (row.instructor_id as string | null | undefined) ?? null,
	}));

	const instructorIds = [
		...new Set(
			rows
				.map((row) => row.instructor_id as string | null)
				.filter((id): id is string => Boolean(id)),
		),
	];
	let instructorLabelById = new Map<string, string>();
	if (instructorIds.length) {
		const { data: profiles } = await srv
			.from("profiles")
			.select("id, real_name, nickname")
			.in("id", instructorIds);
		const emailMap = await getAuthEmailsByUserIds(srv, instructorIds);
		instructorLabelById = new Map(
			(profiles ?? []).map((p) => {
				const id = p.id as string;
				const label =
					((p.real_name ?? p.nickname) as string | null) ||
					emailMap.get(id) ||
					"—";
				return [id, label];
			}),
		);
	}

	const courses = rows.map((row) => {
		const id = row.instructor_id as string | null;
		const fallbackLabel =
			typeof row.instructor_label === "string" && row.instructor_label.trim()
				? row.instructor_label
				: null;
		return {
			...row,
			instructor_label: id ? (instructorLabelById.get(id) ?? fallbackLabel) : fallbackLabel,
		};
	});

	return NextResponse.json({ courses });
}
