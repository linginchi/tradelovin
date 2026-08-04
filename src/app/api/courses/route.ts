import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabase } from "@/lib/supabase/service";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";

export const runtime = "nodejs";

const topicIdSchema = z.string().uuid();

function stripTopicIdFromSelect(select: string): string {
	return select
		.split(",")
		.filter((col) => col.trim() !== "topic_id")
		.join(",");
}

function isMissingTopicIdColumn(message: string): boolean {
	return message.includes("topic_id") && /does not exist|column/.test(message);
}

export async function GET(request: Request) {
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const topicIdRaw = new URL(request.url).searchParams.get("topicId");
	let topicId: string | undefined;
	if (topicIdRaw) {
		const parsed = topicIdSchema.safeParse(topicIdRaw);
		if (!parsed.success) {
			return NextResponse.json({ error: "topicId 无效" }, { status: 400 });
		}
		topicId = parsed.data;
	}

	const baseSelect =
		"id,title,description,cover_image,instructor_label,mode,start_date,end_date,location,capacity,price,is_active,created_at,topic_id";
	const withInstructorIdSelect = `${baseSelect},instructor_id`;

	const runQuery = (select: string, filterTopicId: string | undefined) => {
		let q = srv.from("courses").select(select).eq("is_active", true);
		if (filterTopicId) q = q.eq("topic_id", filterTopicId);
		return q.order("created_at", { ascending: false });
	};

	let data: Record<string, unknown>[] | null = null;
	let error: { message: string } | null = null;
	let includesTopicId = true;

	const withIdRes = await runQuery(withInstructorIdSelect, topicId);
	if (withIdRes.error) {
		const fallbackRes = await runQuery(baseSelect, topicId);
		if (fallbackRes.error && isMissingTopicIdColumn(fallbackRes.error.message)) {
			if (topicId) {
				return NextResponse.json({ error: fallbackRes.error.message }, { status: 500 });
			}
			includesTopicId = false;
			const noTopicWithId = stripTopicIdFromSelect(withInstructorIdSelect);
			const noTopicBase = stripTopicIdFromSelect(baseSelect);
			const retryWithId = await runQuery(noTopicWithId, undefined);
			if (retryWithId.error) {
				const retryBase = await runQuery(noTopicBase, undefined);
				data = retryBase.data as unknown as Record<string, unknown>[] | null;
				error = retryBase.error;
			} else {
				data = retryWithId.data as unknown as Record<string, unknown>[] | null;
				error = retryWithId.error;
			}
		} else {
			data = fallbackRes.data as unknown as Record<string, unknown>[] | null;
			error = fallbackRes.error;
		}
	} else {
		data = withIdRes.data as unknown as Record<string, unknown>[] | null;
		error = withIdRes.error;
	}

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const rows: Record<string, unknown>[] = (data ?? []).map((row) => ({
		...row,
		instructor_id: (row.instructor_id as string | null | undefined) ?? null,
		topic_id: includesTopicId ? ((row.topic_id as string | null | undefined) ?? null) : null,
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
