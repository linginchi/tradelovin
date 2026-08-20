import { NextResponse } from "next/server";

import { canOpenCoachDesk, coachBadgePayload } from "@/lib/coach/guard";
import {
	attachRequestNames,
	attachStudentNames,
	bindStudentToCoach,
	getStudentBinding,
	listCoachDirectory,
	listCoachInventory,
	listCoachRequests,
	listCoachStudents,
	listStudentRequests,
} from "@/lib/coach/service";
import { displayNameFromProfile } from "@/lib/coach/types";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	try {
		const [binding, directory, requests] = await Promise.all([
			getStudentBinding(service, ctx.userId),
			listCoachDirectory(service),
			listStudentRequests(service, ctx.userId),
		]);
		const accepted = binding?.status === "accepted" ? binding : null;
		let coachName = "";
		if (accepted) {
			const { data } = await service
				.from("profiles")
				.select("real_name, nickname")
				.eq("id", accepted.coach_id)
				.maybeSingle();
			coachName = displayNameFromProfile((data as { real_name?: string | null; nickname?: string | null }) ?? {});
		}
		const inventory = accepted ? await listCoachInventory(service, accepted.coach_id) : [];
		const namedRequests = await attachRequestNames(service, requests);
		const access = await canOpenCoachDesk(service, ctx.userId);
		let desk: {
			canOpenDesk: true;
			inventory: Awaited<ReturnType<typeof listCoachInventory>>;
			pendingRequests: Awaited<ReturnType<typeof attachRequestNames>>;
			students: Awaited<ReturnType<typeof attachStudentNames>>;
		} | null = null;
		if (access.canOpenDesk) {
			const [ownInventory, pendingRows, students] = await Promise.all([
				listCoachInventory(service, ctx.userId),
				listCoachRequests(service, ctx.userId, "pending"),
				listCoachStudents(service, ctx.userId),
			]);
			const [pendingRequests, namedStudents] = await Promise.all([
				attachRequestNames(service, pendingRows),
				attachStudentNames(service, students),
			]);
			desk = {
				canOpenDesk: true,
				inventory: ownInventory,
				pendingRequests,
				students: namedStudents,
			};
		}
		return NextResponse.json({
			success: true,
			data: {
				binding: binding
					? {
							coachId: binding.coach_id,
							status: binding.status,
							coachName: accepted ? coachName : directory.find((item) => item.id === binding.coach_id)?.name ?? "",
						}
					: null,
				coach: accepted
					? {
							id: accepted.coach_id,
							name: coachName,
							badge: coachBadgePayload(),
						}
					: null,
				directory,
				inventory,
				requests: namedRequests,
				canOpenDesk: access.canOpenDesk,
				desk,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取教练资源失败" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
	const coachId = typeof rec.coachId === "string" ? rec.coachId : "";
	if (!coachId) {
		return NextResponse.json({ success: false, error: "请选择教练" }, { status: 400 });
	}
	try {
		const binding = await bindStudentToCoach(service, ctx.userId, coachId);
		return NextResponse.json({ success: true, data: binding });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "绑定失败" },
			{ status: 400 },
		);
	}
}
