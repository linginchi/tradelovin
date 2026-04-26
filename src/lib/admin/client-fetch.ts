/**
 * 浏览器请求 /api/admin/* 时统一附带 HttpOnly cookie（管理员 JWT）。
 * 与服务端 `requireAdminSession` / `requireSuperAdminSession` 配套使用。
 */
export function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	return fetch(input, { ...init, credentials: "include" });
}
