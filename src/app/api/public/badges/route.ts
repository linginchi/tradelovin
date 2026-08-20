import { jsonWithCache } from "@/lib/http-cache";

import { GOLDEN_LEOPARD_COACH_BADGE } from "@/lib/coach/types";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const userId = url.searchParams.get("userId")?.trim() ?? "";
	if (!userId) {
		return jsonWithCache({
			badges: [] as Array<{ id: string; name: string; description: string }>,
		});
	}
	const service = getServiceSupabase();
	if (!service) {
		return jsonWithCache({ badges: [] });
	}
	const { data } = await service.from("profiles").select("is_coach").eq("id", userId).maybeSingle();
	const badges = (data as { is_coach?: boolean } | null)?.is_coach
		? [{ id: GOLDEN_LEOPARD_COACH_BADGE.id, name: GOLDEN_LEOPARD_COACH_BADGE.name, description: GOLDEN_LEOPARD_COACH_BADGE.description }]
		: [];
	return jsonWithCache({ badges });
}
