import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	email: z.string().email(),
});

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("admins")
		.select("email, role, created_at, created_by")
		.order("created_at", { ascending: true });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ admins: data ?? [] });
}

export async function POST(req: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;
	const { session } = gated;

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

	const email = parsed.data.email.trim().toLowerCase();

	const { data, error } = await supabase
		.from("admins")
		.insert({
			email,
			role: "admin",
			created_by: session.email,
		})
		.select()
		.maybeSingle();

	if (error) {
		if (error.code === "23505") {
			return NextResponse.json({ error: "Admin already exists" }, { status: 409 });
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ admin: data });
}

const patchSchema = z.object({
	email: z.string().email(),
	role: z.enum(["admin", "super_admin"]),
});

export async function PATCH(req: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;
	const { session } = gated;

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

	const parsed = patchSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const email = parsed.data.email.trim().toLowerCase();

	if (email === session.email && parsed.data.role !== "super_admin") {
		return NextResponse.json({ error: "Cannot demote yourself" }, { status: 400 });
	}

	const { data: target } = await supabase.from("admins").select("role").eq("email", email).maybeSingle();

	if (!target) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (target.role === "super_admin" && parsed.data.role === "admin") {
		const { count } = await supabase
			.from("admins")
			.select("email", { count: "exact", head: true })
			.eq("role", "super_admin");

		if ((count ?? 0) <= 1) {
			return NextResponse.json({ error: "Cannot demote the last super admin" }, { status: 400 });
		}
	}

	const { error } = await supabase.from("admins").update({ role: parsed.data.role }).eq("email", email);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;
	const { session } = gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
	if (!email) {
		return NextResponse.json({ error: "Missing email" }, { status: 400 });
	}

	if (email === session.email) {
		return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
	}

	const { data: target } = await supabase
		.from("admins")
		.select("role")
		.eq("email", email)
		.maybeSingle();

	if (!target) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (target.role === "super_admin") {
		const { count } = await supabase
			.from("admins")
			.select("email", { count: "exact", head: true })
			.eq("role", "super_admin");

		if ((count ?? 0) <= 1) {
			return NextResponse.json({ error: "Cannot remove the last super admin" }, { status: 400 });
		}
	}

	const { error } = await supabase.from("admins").delete().eq("email", email);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
