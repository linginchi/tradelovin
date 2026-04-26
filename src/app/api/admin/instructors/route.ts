import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	name: z.string().min(1),
	bio: z.string().nullable().optional(),
	specialties: z.array(z.string()).optional(),
});

export async function GET() {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("profiles")
		.select("id, full_name, nickname, bio, specialties")
		.eq("is_instructor", true)
		.order("created_at", { ascending: true });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const instructors = (data ?? []).map((row) => ({
		id: row.id as string,
		name: ((row.full_name ?? row.nickname) as string) || "—",
		bio: row.bio as string | null,
		specialties: (row.specialties as string[]) ?? [],
	}));

	return NextResponse.json({ instructors });
}

export async function POST(req: Request) {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = postSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("profiles")
		.insert({
			full_name: parsed.data.name.trim(),
			bio: parsed.data.bio?.trim() || null,
			specialties: parsed.data.specialties ?? [],
			is_instructor: true,
			role: "user",
		})
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const row = data as {
		id: string;
		full_name: string | null;
		nickname: string | null;
		bio: string | null;
		specialties: string[];
	};

	return NextResponse.json({
		instructor: {
			id: row.id,
			name: row.full_name ?? row.nickname ?? "—",
			bio: row.bio,
			specialties: row.specialties ?? [],
		},
	});
}
