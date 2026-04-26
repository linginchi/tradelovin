import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET(req: Request) {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { searchParams } = new URL(req.url);
	const search = (searchParams.get("search") ?? "").trim().replace(/%/g, "").slice(0, 120);
	const status = (searchParams.get("status") ?? "").trim();

	let q = supabase.from("registrations").select("*").order("created_at", { ascending: false });

	if (status) {
		q = q.eq("status", status);
	}

	if (search) {
		const p = `%${search}%`;
		q = q.or(`nickname.ilike.${p},real_name.ilike.${p},email.ilike.${p}`);
	}

	const { data, error } = await q;

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ students: data ?? [] });
}
