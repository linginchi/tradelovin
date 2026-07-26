import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const PUBLIC_LIST = "src/app/api/courses/[courseId]/videos/route.ts";
const ADMIN_LIST = "src/app/api/admin/courses/[courseId]/videos/route.ts";
const ADMIN_VIDEO = "src/app/api/admin/courses/[courseId]/videos/[videoId]/route.ts";
const CRON_ROUTE = "src/app/api/cron/video-marketing-growth/route.ts";
const GROWTH_SERVICE = "src/lib/video/marketing-growth-service.ts";
const GROWTH_MATH = "src/lib/video/marketing-growth.mjs";
const COURSE_DETAIL = "src/components/courses/CourseDetailClient.tsx";
const ADMIN_UI = "src/components/admin/AdminCourseDetailClient.tsx";
const OPENNEXT_WF = ".github/workflows/opennext-build.yml";
const MARKETING_WF = ".github/workflows/video-marketing-growth.yml";
const MIGRATION_GLOB_PREFIX = "20260726";

/** Executable SQL only. */
function sqlWithoutComments(sql) {
	return sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n");
}

async function findMarketingMigration() {
	const dir = new URL("supabase/migrations/", root);
	const files = await readdir(dir);
	const match = files
		.filter((f) => f.endsWith(".sql") && f.startsWith(MIGRATION_GLOB_PREFIX))
		.filter((f) => /marketing/i.test(f))
		.sort();
	assert.ok(match.length >= 1, "expected a marketing migration after 20260726");
	const name = match[match.length - 1];
	assert.ok(
		name > "20260725170000_video_view_events.sql",
		"marketing migration timestamp must be later than video_view_events",
	);
	return `supabase/migrations/${name}`;
}

test("public list API exposes marketing_view_count only, never real view_count", async () => {
	const source = await read(PUBLIC_LIST);

	assert.match(source, /COLUMNS_WITH_POPULARITY\s*=\s*`\$\{BASE_COLUMNS\}, marketing_view_count`/);
	assert.ok(!/`\$\{BASE_COLUMNS\}, view_count`/.test(source), "public list must not select real view_count");
	assert.ok(!/\.select\([^)]*\bview_count\b/.test(source.replace(/marketing_view_count/g, "POP")), "no select of real counter");
	assert.ok(!source.includes("video_view_events"), "public list must not read viewer events");
	assert.ok(!source.includes("course_video_marketing_growth"), "public list must not read growth audit tables");
	assert.match(source, /popularityAvailable/);
});

test("admin video API exposes real view_count and editable marketing_view_count", async () => {
	const list = await read(ADMIN_LIST);
	assert.match(list, /view_count/);
	assert.match(list, /marketing_view_count/);

	const patch = await read(ADMIN_VIDEO);
	assert.match(patch, /export async function PATCH/);
	assert.match(patch, /marketing_view_count/);
	assert.match(patch, /requireAdminSession/);
	assert.match(patch, /\.nonnegative\(\)|\.min\(0\)/);
	// Real counter stays read-only: PATCH body must not write view_count.
	const patchBody = patch.slice(patch.indexOf("export async function PATCH"));
	assert.ok(!/\.update\(\s*\{[^}]*view_count\s*:/.test(patchBody.replace(/marketing_view_count/g, "MARKETING")));
});

test("admin UI labels distinguish real views vs popularity", async () => {
	const source = await read(ADMIN_UI);
	assert.match(source, /view_count|真实观看|真實觀看/);
	assert.match(source, /marketing_view_count|人气|人氣/);
	assert.match(source, /PATCH|method:\s*["']PATCH["']/);
});

test("course detail shows popularity copy in all three locales", async () => {
	const source = await read(COURSE_DETAIL);
	assert.match(source, /marketing_view_count/);
	assert.match(source, /useTranslations\("CourseDetailPage"\)/);
	assert.match(source, /t\("popularity"\)/);

	const en = JSON.parse(await read("messages/en.json"));
	const zh = JSON.parse(await read("messages/zh.json"));
	const zhTW = JSON.parse(await read("messages/zh-TW.json"));
	assert.equal(en.CourseDetailPage.popularity, "Popularity");
	assert.equal(zh.CourseDetailPage.popularity, "人气");
	assert.equal(zhTW.CourseDetailPage.popularity, "人氣");
});

test("marketing migration adds column, plan/apply tables, and atomic hour apply", async () => {
	const path = await findMarketingMigration();
	const sql = sqlWithoutComments(await read(path));

	assert.match(sql, /marketing_view_count BIGINT NOT NULL DEFAULT 0/);
	assert.match(sql, /marketing_view_count\s*>=\s*0/);
	assert.match(sql, /course_video_marketing_growth_plans/);
	assert.match(sql, /course_video_marketing_growth_applies/);
	assert.match(sql, /PRIMARY KEY\s*\(\s*video_id\s*,\s*plan_date\s*\)/);
	assert.match(sql, /PRIMARY KEY\s*\(\s*video_id\s*,\s*plan_date\s*,\s*hour_slot\s*\)/);
	assert.match(sql, /hour_slot\s+SMALLINT/);
	assert.match(
		sql,
		/CREATE OR REPLACE FUNCTION public\.apply_course_video_marketing_growth_hour/,
	);
	assert.match(sql, /ON CONFLICT\s*\(/);
	assert.match(sql, /SECURITY DEFINER/);
	assert.match(
		sql,
		/GRANT EXECUTE ON FUNCTION public\.apply_course_video_marketing_growth_hour/,
	);
	assert.ok(!/view_count\s*=\s*view_count\s*\+\s*/i.test(sql), "must not bump real view_count");
	assert.ok(!/Math\.random|random\s*\(/i.test(sql), "SQL must not use random()");
});

test("growth math avoids Math.random and uses Hong Kong timezone", async () => {
	const math = await read(GROWTH_MATH);
	assert.ok(!/\bMath\.random\s*\(/.test(math), "growth math must not call Math.random()");
	assert.match(math, /Asia\/Hong_Kong/);
	assert.match(math, /mulberry32|createHash/);

	const service = await read(GROWTH_SERVICE);
	assert.ok(!/\bMath\.random\s*\(/.test(service), "growth service must not call Math.random()");
	assert.match(service, /apply_course_video_marketing_growth_hour/);
	assert.match(service, /course_video_marketing_growth_plans/);
	assert.match(service, /dueHourSlots|hourAllocations/);
});

test("cron endpoint requires VIDEO_MARKETING_GROWTH_CRON_KEY", async () => {
	const source = await read(CRON_ROUTE);
	assert.match(source, /VIDEO_MARKETING_GROWTH_CRON_KEY/);
	assert.match(source, /x-video-marketing-growth-cron-key/);
	assert.match(source, /status:\s*401/);
	assert.match(source, /status:\s*503/);
	assert.ok(!source.includes("TQ_CRON_API_KEY"), "must use the marketing-specific secret");
	assert.ok(
		!/video_view_events|increment_course_video_view_count/.test(source),
		"cron must not touch real view counting",
	);
});

test("hourly marketing workflow is gated and does not re-trigger TQ job", async () => {
	const marketing = await read(MARKETING_WF);
	const opennext = await read(OPENNEXT_WF);

	assert.match(marketing, /cron:\s*"0 \* \* \* \*"/);
	assert.match(marketing, /VIDEO_MARKETING_GROWTH_CRON_KEY/);
	assert.match(marketing, /\/api\/cron\/video-marketing-growth/);
	// Missing config must hard-fail the Actions job (never exit 0 / pretend success).
	assert.match(marketing, /Missing .*TQ_CRON_BASE_URL[\s\S]*?exit 1/);
	assert.match(marketing, /Missing .*VIDEO_MARKETING_GROWTH_CRON_KEY[\s\S]*?exit 1/);
	assert.ok(!/Skip marketing growth/i.test(marketing), "must not soft-skip missing config");
	assert.ok(!marketing.includes("/api/tq/cron/recalculate"), "marketing workflow must not call TQ");
	assert.ok(
		!/VIDEO_MARKETING_GROWTH_CRON_KEY\s*[:=]\s*["'][^"']+["']/.test(marketing),
		"cron key must not be hardcoded",
	);

	assert.match(opennext, /cron:\s*"5 8 \* \* 1-5"/);
	assert.ok(
		!opennext.includes("0 * * * *"),
		"opennext workflow must not gain an hourly schedule that would also fire TQ",
	);
	assert.match(opennext, /tq-recalculate:/);
	assert.match(opennext, /github\.event_name\s*==\s*'schedule'/);
	assert.ok(!opennext.includes("video-marketing-growth"), "TQ workflow must not call marketing cron");

	const workflows = await readdir(new URL(".github/workflows", root));
	assert.ok(
		!workflows.some((file) => /bump|view.?count/i.test(file)),
		"no real view-count bump workflow filename",
	);
});

test("reviewed migrations stay untouched", async () => {
	const counter = await read("supabase/migrations/20260715072400_restore_course_video_view_count.sql");
	const topics = await read("supabase/migrations/20260725100000_course_topics.sql");
	const events = await read("supabase/migrations/20260725170000_video_view_events.sql");
	assert.match(counter, /view_count BIGINT NOT NULL DEFAULT 0/);
	assert.match(topics, /course_topics/);
	assert.match(events, /video_view_events/);
	assert.ok(!counter.includes("marketing_view_count"));
	assert.ok(!events.includes("marketing_view_count"));
});
