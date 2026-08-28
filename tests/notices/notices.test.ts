import assert from "node:assert/strict";
import test from "node:test";

import {
	markNoticesRead,
	sortNoticesForInbox,
	unreadCount,
	validateCreateNotice,
	type AppNotice,
} from "@/lib/notices/notices";

function notice(partial: Partial<AppNotice> & Pick<AppNotice, "id">): AppNotice {
	return {
		user_id: "user-1",
		title: "标题",
		body: "正文",
		created_by: "admin@example.com",
		read_at: null,
		created_at: "2026-08-26T01:00:00.000Z",
		...partial,
	};
}

test("validateCreateNotice rejects empty title and body", () => {
	assert.deepEqual(validateCreateNotice({ userId: "d53c8baa-bf99-47f2-8e90-0e650bba770f", title: "  ", body: "ok" }), {
		ok: false,
		error: "标题不能为空",
	});
	assert.deepEqual(validateCreateNotice({ userId: "d53c8baa-bf99-47f2-8e90-0e650bba770f", title: "ok", body: "   " }), {
		ok: false,
		error: "正文不能为空",
	});
});

test("validateCreateNotice rejects missing user id and oversized copy", () => {
	assert.deepEqual(validateCreateNotice({ userId: "", title: "t", body: "b" }), {
		ok: false,
		error: "请选择学员账号",
	});
	assert.deepEqual(
		validateCreateNotice({
			userId: "d53c8baa-bf99-47f2-8e90-0e650bba770f",
			title: "x".repeat(81),
			body: "b",
		}),
		{ ok: false, error: "标题最多 80 字" },
	);
	assert.deepEqual(
		validateCreateNotice({
			userId: "d53c8baa-bf99-47f2-8e90-0e650bba770f",
			title: "t",
			body: "y".repeat(2001),
		}),
		{ ok: false, error: "正文最多 2000 字" },
	);
});

test("validateCreateNotice trims a valid payload", () => {
	assert.deepEqual(
		validateCreateNotice({
			userId: "  d53c8baa-bf99-47f2-8e90-0e650bba770f  ",
			title: "  已修复  ",
			body: "  请刷新后再试  ",
		}),
		{
			ok: true,
			userId: "d53c8baa-bf99-47f2-8e90-0e650bba770f",
			title: "已修复",
			body: "请刷新后再试",
		},
	);
});

test("unreadCount ignores already-read notices", () => {
	assert.equal(
		unreadCount([
			notice({ id: "1", read_at: null }),
			notice({ id: "2", read_at: "2026-08-26T02:00:00.000Z" }),
			notice({ id: "3" }),
		]),
		2,
	);
});

test("markNoticesRead can mark one id or all unread", () => {
	const now = "2026-08-26T03:00:00.000Z";
	const rows = [
		notice({ id: "1", read_at: null }),
		notice({ id: "2", read_at: "2026-08-26T02:00:00.000Z" }),
		notice({ id: "3", read_at: null }),
	];
	assert.deepEqual(
		markNoticesRead(rows, ["1"], now).map((row) => [row.id, row.read_at]),
		[
			["1", now],
			["2", "2026-08-26T02:00:00.000Z"],
			["3", null],
		],
	);
	assert.deepEqual(
		markNoticesRead(rows, "all", now).map((row) => [row.id, row.read_at]),
		[
			["1", now],
			["2", "2026-08-26T02:00:00.000Z"],
			["3", now],
		],
	);
});

test("sortNoticesForInbox puts unread first then newest", () => {
	const sorted = sortNoticesForInbox([
		notice({ id: "old-unread", created_at: "2026-08-20T00:00:00.000Z", read_at: null }),
		notice({ id: "new-read", created_at: "2026-08-26T00:00:00.000Z", read_at: "2026-08-26T01:00:00.000Z" }),
		notice({ id: "new-unread", created_at: "2026-08-25T00:00:00.000Z", read_at: null }),
	]);
	assert.deepEqual(
		sorted.map((row) => row.id),
		["new-unread", "old-unread", "new-read"],
	);
});
