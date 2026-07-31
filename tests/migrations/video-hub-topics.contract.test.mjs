// tests/migrations/video-hub-topics.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const sqlPath = "supabase/migrations/20260731120000_video_hub_topics.sql";

test("video hub migration seeds three topics and rebinds known courses", async () => {
	const sql = await readFile(new URL(sqlPath, root), "utf8");
	assert.match(sql, /交易经典/);
	assert.match(sql, /录播教学/);
	assert.match(sql, /课程直播/);
	assert.match(sql, /sort_order\s*=\s*10|sort_order,\s*10/);
	assert.match(sql, /9ea59ef3-2f1f-4d61-be3f-29b7cc664084/); // 豹哥
	assert.match(sql, /78cc57c5-6b1c-462a-b8c6-ed5ceb5e14fb/); // 豹叔
	assert.match(sql, /5da6f2fa-4e98-4bcf-ae3a-378da4302b07/); // 第一课
	assert.match(sql, /cf934e87-90ba-47c5-baab-6c1bf434ddb4/);
	assert.match(sql, /3f9c2852-bb6a-48d1-a22f-51242e253dd5/);
	assert.match(sql, /1f7546e5-0684-4570-953c-686c90800c30/);
	assert.match(sql, /71e9740f-847d-4c3f-97fe-7acf7ea32932/);
	assert.match(sql, /c40fbe73-08d7-465a-bacd-9b4d8978dfdf/); // A股基础知识 → null
	assert.match(sql, /is_active\s*=\s*false/);
});

test("video hub migration is idempotent (UPDATE before INSERT, no title gate)", async () => {
	const sql = await readFile(new URL(sqlPath, root), "utf8");
	const updateIdx = sql.indexOf("UPDATE public.course_topics t");
	const insertIdx = sql.indexOf("INSERT INTO public.course_topics");
	assert.ok(updateIdx >= 0 && insertIdx > updateIdx, "UPDATE hub rows must run before INSERT");
	assert.match(
		sql,
	 /WHERE NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.course_topics t\s*\n\s*WHERE t\.sort_order = v\.sort_order AND t\.is_active = true\s*\n\s*\)/,
	);
	assert.doesNotMatch(sql, /t\.title\s*=\s*v\.title/);
	assert.match(sql, /ROW_NUMBER\(\) OVER/);
});
