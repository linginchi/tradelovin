import type { SupabaseClient } from "@supabase/supabase-js";
import type { RiskFailureMeta, RiskMessageLevel, RiskMessageRow } from "@/lib/trade-v2/failure-types";

export async function pushRiskMessage(
	supabase: SupabaseClient,
	input: {
		userId: string;
		level?: RiskMessageLevel;
		code?: string;
		title: string;
		content: string;
		meta?: RiskFailureMeta;
	},
) {
	const { error } = await supabase.from("tq_risk_messages").insert({
		user_id: input.userId,
		level: input.level ?? "warning",
		code: input.code ?? null,
		title: input.title,
		content: input.content,
		meta: input.meta ?? {},
	});
	if (error) throw new Error(error.message);
}

export async function listRiskMessages(
	supabase: SupabaseClient,
	userId: string,
	unreadOnly = false,
): Promise<RiskMessageRow[]> {
	let query = supabase
		.from("tq_risk_messages")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(100);
	if (unreadOnly) {
		query = query.is("read_at", null);
	}
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? []) as RiskMessageRow[];
}

export async function markRiskMessagesRead(supabase: SupabaseClient, userId: string, ids: string[] | "all") {
	if (ids === "all") {
		const { error } = await supabase
			.from("tq_risk_messages")
			.update({ read_at: new Date().toISOString() })
			.eq("user_id", userId)
			.is("read_at", null);
		if (error) throw new Error(error.message);
		return;
	}
	if (ids.length === 0) return;
	const { error } = await supabase
		.from("tq_risk_messages")
		.update({ read_at: new Date().toISOString() })
		.eq("user_id", userId)
		.in("id", ids);
	if (error) throw new Error(error.message);
}
