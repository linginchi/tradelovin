export type AppNotice = {
	id: string;
	user_id: string;
	title: string;
	body: string;
	created_by: string;
	read_at: string | null;
	created_at: string;
};

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 2000;

export type CreateNoticeInput = {
	userId: string;
	title: string;
	body: string;
};

export type CreateNoticeResult =
	| { ok: true; userId: string; title: string; body: string }
	| { ok: false; error: string };

export function validateCreateNotice(input: CreateNoticeInput): CreateNoticeResult {
	const userId = input.userId.trim();
	const title = input.title.trim();
	const body = input.body.trim();
	if (!userId) return { ok: false, error: "请选择学员账号" };
	if (!title) return { ok: false, error: "标题不能为空" };
	if (!body) return { ok: false, error: "正文不能为空" };
	if (title.length > NOTICE_TITLE_MAX) return { ok: false, error: "标题最多 80 字" };
	if (body.length > NOTICE_BODY_MAX) return { ok: false, error: "正文最多 2000 字" };
	return { ok: true, userId, title, body };
}

export function unreadCount(notices: Pick<AppNotice, "read_at">[]): number {
	return notices.filter((row) => !row.read_at).length;
}

export function markNoticesRead<T extends Pick<AppNotice, "id" | "read_at">>(
	notices: T[],
	ids: string[] | "all",
	now: string,
): T[] {
	return notices.map((row) => {
		if (row.read_at) return row;
		if (ids === "all" || ids.includes(row.id)) return { ...row, read_at: now };
		return row;
	});
}

export function sortNoticesForInbox<T extends Pick<AppNotice, "read_at" | "created_at">>(notices: T[]): T[] {
	return [...notices].sort((a, b) => {
		const unreadDelta = Number(Boolean(a.read_at)) - Number(Boolean(b.read_at));
		if (unreadDelta !== 0) return unreadDelta;
		return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
	});
}
