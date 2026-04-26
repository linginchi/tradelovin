import { NextResponse } from "next/server";
import { z } from "zod";

import { nextBdStudentId } from "@/lib/admin/student-code";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "edge";

const patchSchema = z
	.object({
		real_name: z.string().nullable().optional(),
		nickname: z.string().min(1).optional(),
		email: z.string().email().optional(),
		phone: z.string().nullable().optional(),
		address: z.string().nullable().optional(),
		student_id: z.string().nullable().optional(),
		status: z.enum(["pending", "approved", "rejected"]).optional(),
		rejection_reason: z.string().nullable().optional(),
		learning_goals: z.string().nullable().optional(),
		emergency_phone: z.string().nullable().optional(),
		assign_student_id: z.boolean().optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

	const { emergency_phone: emergIn, assign_student_id: wantAssign, ...regFields } = parsed.data;

	const regUpdates: Record<string, unknown> = { ...regFields };
	delete regUpdates.assign_student_id;
	Object.keys(regUpdates).forEach((k) => {
		const key = k as keyof typeof regUpdates;
		if (regUpdates[key] === undefined) delete regUpdates[key];
	});

	const { data: before, error: beforeErr } = await supabase
		.from("registrations")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (beforeErr || !before) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const emailBefore = String(before.email ?? "")
		.trim()
		.toLowerCase();

	const { data: profBefore } = await supabase
		.from("profiles")
		.select("id, student_id")
		.eq("email", emailBefore)
		.maybeSingle();

	if (wantAssign) {
		const hasSid = Boolean(before.student_id) || Boolean(profBefore?.student_id);
		if (hasSid) {
			return NextResponse.json({ error: "Student id already set" }, { status: 400 });
		}
		try {
			regUpdates.student_id = await nextBdStudentId(supabase);
		} catch (e) {
			return NextResponse.json(
				{ error: e instanceof Error ? e.message : "Could not allocate student id" },
				{ status: 500 },
			);
		}
	}

	const hasRegUpdates = Object.keys(regUpdates).length > 0;
	const hasEmerg = emergIn !== undefined;

	if (!hasRegUpdates && !hasEmerg) {
		return NextResponse.json({ error: "No fields to update" }, { status: 400 });
	}

	const nextEmail = regUpdates.email !== undefined ? String(regUpdates.email).trim().toLowerCase() : emailBefore;
	if (regUpdates.email !== undefined && nextEmail !== emailBefore) {
		const { data: clash } = await supabase.from("profiles").select("id").eq("email", nextEmail).maybeSingle();
		if (clash && clash.id !== profBefore?.id) {
			return NextResponse.json({ error: "Profile email already in use" }, { status: 409 });
		}
	}

	if (hasRegUpdates) {
		const { error: updErr } = await supabase.from("registrations").update(regUpdates).eq("id", id);

		if (updErr) {
			if (updErr.code === "23505") {
				return NextResponse.json({ error: "Duplicate student_id or email" }, { status: 409 });
			}
			return NextResponse.json({ error: updErr.message }, { status: 500 });
		}
	}

	const { data: after, error: afterErr } = await supabase.from("registrations").select("*").eq("id", id).maybeSingle();

	if (afterErr || !after) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const emailAfter = String(after.email ?? "")
		.trim()
		.toLowerCase();

	let profileId = profBefore?.id as string | undefined;
	if (!profileId) {
		const { data: profMatch } = await supabase.from("profiles").select("id").eq("email", emailAfter).maybeSingle();
		profileId = profMatch?.id as string | undefined;
	}

	if (hasEmerg && !profileId) {
		return NextResponse.json({ error: "No profile for this email; approve registration first" }, { status: 400 });
	}

	if (profileId) {
		const profilePatch: Record<string, unknown> = {
			full_name: after.real_name,
			nickname: after.nickname,
			phone: after.phone,
			address: after.address,
			email: emailAfter,
		};
		if (after.student_id) {
			profilePatch.student_id = after.student_id;
		}
		if (hasEmerg) {
			profilePatch.emergency_phone =
				emergIn === null || emergIn === "" ? null : emergIn.trim();
		}

		Object.keys(profilePatch).forEach((k) => {
			if (profilePatch[k] === undefined) delete profilePatch[k];
		});

		const { error: pErr } = await supabase.from("profiles").update(profilePatch).eq("id", profileId);
		if (pErr) {
			return NextResponse.json({ error: pErr.message }, { status: 500 });
		}
	}

	return NextResponse.json({ student: after });
}
