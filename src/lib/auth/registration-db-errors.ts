/** PostgREST / Supabase 在缺列时常返回 schema cache 类错误，便于区分运维问题与业务错误。 */
export function registrationSchemaMismatchMessage(raw: string | undefined): string | null {
	if (!raw) return null;
	const lower = raw.toLowerCase();
	if (
		lower.includes("schema cache") ||
		(lower.includes("could not find") && lower.includes("user_id")) ||
		(lower.includes("column") && lower.includes("user_id") && lower.includes("does not exist"))
	) {
		return "数据库报名表结构未更新：请在 Supabase 执行 migrations（`public.registrations` 需含 `user_id`、`status` 等列）。可运行 `supabase db push`，或在 SQL Editor 执行 `supabase/migrations` 中带 `registrations` 的脚本，然后刷新 API schema。";
	}
	return null;
}

export function mapRegistrationInsertError(raw: string | undefined): string {
	return registrationSchemaMismatchMessage(raw) ?? raw ?? "报名记录写入失败";
}
