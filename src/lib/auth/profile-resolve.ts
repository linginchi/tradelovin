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

/** 是否已有该邮箱的学员账号（以 auth.users 为准；邮箱不存 profiles）。 */
export async function tradeUserExistsForEmail(srv: SupabaseClient, emailLower: string): Promise<boolean> {
	return (await getAuthUserIdByEmail(srv, emailLower)) !== null;
}

/** 登录用：auth 用户 id（与 profiles.id 对齐）。 */
export async function getTradeUserIdByEmail(srv: SupabaseClient, emailLower: string): Promise<string | null> {
	return getAuthUserIdByEmail(srv, emailLower);
}

/** 从 auth.users 读取邮箱（profiles 不存 email）。 */
export async function getAuthEmailByUserId(srv: SupabaseClient, userId: string): Promise<string | null> {
	const { data, error } = await srv.auth.admin.getUserById(userId);
	if (error || !data?.user?.email) return null;
	const e = String(data.user.email).trim().toLowerCase();
	return e || null;
}

/** 批量解析 userId → 邮箱（顺序请求，避免压垮 Admin API）。 */
export async function getAuthEmailsByUserIds(
	srv: SupabaseClient,
	userIds: string[],
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	const seen = new Set<string>();
	for (const id of userIds) {
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const e = await getAuthEmailByUserId(srv, id);
		if (e) out.set(id, e);
	}
	return out;
}

/**
 * 服务端读取昵称/邮箱：profiles 仅取昵称；邮箱始终来自 auth.users（或当前会话）。
 */
export async function getTradeNicknameAndEmail(
	srv: SupabaseClient,
	userId: string,
	sessionEmail: string | undefined,
): Promise<{ nickname: string; email: string } | null> {
	const { data: profile } = await srv.from("profiles").select("nickname").eq("id", userId).maybeSingle();

	const { data: authData, error } = await srv.auth.admin.getUserById(userId);
	if (error) {
		console.warn("[getUserById]", error.message);
	}
	const meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
	const authEmail = authData?.user?.email ?? undefined;

	const nickname =
		(profile?.nickname != null && String(profile.nickname).trim()) ||
		resolveNicknameFromMetadata(meta, "学员");

	const email = (authEmail || sessionEmail || "").trim().toLowerCase();

	if (!email) return null;
	return { nickname, email };
}
