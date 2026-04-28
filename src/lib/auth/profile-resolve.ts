import type { SupabaseClient } from "@supabase/supabase-js";

/** 从 auth.users.user_metadata 解析展示用昵称（与注册时写入的字段一致）。 */
export function resolveNicknameFromMetadata(
	meta: Record<string, unknown> | null | undefined,
	fallback = "学员",
): string {
	const n =
		(typeof meta?.nickname === "string" && meta.nickname.trim()) ||
		(typeof meta?.full_name === "string" && meta.full_name.trim()) ||
		(typeof meta?.real_name === "string" && meta.real_name.trim()) ||
		"";
	return n || fallback;
}

/** 通过 Admin API 按邮箱查找 auth 用户（不依赖 profiles 行）。 */
export async function getAuthUserIdByEmail(srv: SupabaseClient, emailLower: string): Promise<string | null> {
	const perPage = 200;
	const maxPages = 25;
	for (let page = 1; page <= maxPages; page++) {
		const { data, error } = await srv.auth.admin.listUsers({ page, perPage });
		if (error) {
			console.error("[auth listUsers]", error.message);
			return null;
		}
		const users = data?.users ?? [];
		const hit = users.find((u) => u.email?.toLowerCase() === emailLower);
		if (hit) return hit.id;
		if (users.length < perPage) break;
	}
	return null;
}

/** 是否已有该邮箱的学员账号：profiles 或 auth.users 任一有即视为已注册。 */
export async function tradeUserExistsForEmail(srv: SupabaseClient, emailLower: string): Promise<boolean> {
	const { data: p } = await srv.from("profiles").select("id").eq("email", emailLower).maybeSingle();
	if (p?.id) return true;
	const uid = await getAuthUserIdByEmail(srv, emailLower);
	return uid !== null;
}

/** 登录用：优先 profiles.id，无行则回退 auth 用户 id。 */
export async function getTradeUserIdByEmail(srv: SupabaseClient, emailLower: string): Promise<string | null> {
	const { data: p } = await srv.from("profiles").select("id").eq("email", emailLower).maybeSingle();
	if (p?.id) return p.id as string;
	return getAuthUserIdByEmail(srv, emailLower);
}

/**
 * 服务端读取昵称/邮箱：优先 public.profiles，缺省字段时用 auth.admin.getUserById 的 user_metadata / email。
 */
export async function getTradeNicknameAndEmail(
	srv: SupabaseClient,
	userId: string,
	sessionEmail: string | undefined,
): Promise<{ nickname: string; email: string } | null> {
	const { data: profile } = await srv.from("profiles").select("nickname,email").eq("id", userId).maybeSingle();

	let meta: Record<string, unknown> | undefined;
	let authEmail: string | undefined;

	const needAuth =
		!profile ||
		!(profile.nickname != null && String(profile.nickname).trim()) ||
		!(profile.email != null && String(profile.email).trim());

	if (needAuth) {
		const { data: authData, error } = await srv.auth.admin.getUserById(userId);
		if (error) {
			console.warn("[getUserById]", error.message);
		}
		meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
		authEmail = authData?.user?.email ?? undefined;
	}

	const nickname =
		(profile?.nickname != null && String(profile.nickname).trim()) ||
		resolveNicknameFromMetadata(meta, "学员");

	const email = (
		(profile?.email != null && String(profile.email).trim()) ||
		authEmail ||
		sessionEmail ||
		""
	).toLowerCase();

	if (!email) return null;
	return { nickname, email };
}
