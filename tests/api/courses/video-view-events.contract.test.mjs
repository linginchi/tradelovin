import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const PLAY_ROUTE = "src/app/api/courses/[courseId]/videos/[videoId]/play/route.ts";
const LIST_ROUTE = "src/app/api/courses/[courseId]/videos/route.ts";
const HELPER = "src/lib/analytics/video-views.ts";
const PLAYER = "src/components/video/VideoPlayerClient.tsx";
const EVENTS_MIGRATION = "supabase/migrations/20260725170000_video_view_events.sql";
const COUNTER_MIGRATION = "supabase/migrations/20260715072400_restore_course_video_view_count.sql";

/** Executable SQL only, so assertions cannot be satisfied by comment text. */
function sqlWithoutComments(sql) {
	return sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n");
}

test("counting happens only after the authorization gate, never on URL issuance", async () => {
	const source = await read(PLAY_ROUTE);

	const getStart = source.indexOf("export async function GET");
	const postStart = source.indexOf("export async function POST");
	assert.ok(getStart > -1 && postStart > getStart, "expected GET then POST handlers");

	const getBody = source.slice(getStart, postStart);
	assert.ok(!getBody.includes("recordVideoView"), "GET must not record a view");

	const postBody = source.slice(postStart);
	const authorizeAt = postBody.indexOf("await authorizeViewer(");
	const recordAt = postBody.indexOf("await recordVideoView(");
	assert.ok(authorizeAt > -1, "POST must authorize the viewer");
	assert.ok(recordAt > -1, "POST must record the view");
	assert.ok(authorizeAt < recordAt, "authorization must precede counting");
	assert.match(postBody, /if \(viewer instanceof NextResponse\) return viewer;/);

	const loadAt = postBody.indexOf("await loadVideo(");
	assert.ok(loadAt > -1 && loadAt < authorizeAt, "video lookup must precede authorization");
	assert.match(source, /return NextResponse\.json\(\{ error: "视频不存在" \}, \{ status: 404 \}\)/);
});

test("unauthenticated and unauthorized viewers never increment the counter", async () => {
	const source = await read(PLAY_ROUTE);

	assert.match(
		source,
		/if \(!viewer\.viewerId\) \{\s*return NextResponse\.json\(\{ counted: false, viewCount: null \}\);/,
	);
	assert.match(
		source,
		/if \(!viewerId\) \{\s*return NextResponse\.json\(\s*\{ error: "无权限观看，请先购买课程" \}/,
	);
	assert.match(source, /const allowed = await hasCourseAccess\(srv, viewerId, courseId\);/);

	const sql = sqlWithoutComments(await read(EVENTS_MIGRATION));
	assert.match(sql, /user_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
});

test("atomic RPC inserts the dedup event and increments only inside one transaction", async () => {
	const sql = sqlWithoutComments(await read(EVENTS_MIGRATION));

	assert.match(
		sql,
		/CREATE OR REPLACE FUNCTION public\.record_course_video_view\(\s*p_video_id UUID,\s*p_user_id UUID\s*\)/,
	);
	assert.match(sql, /SECURITY DEFINER/);
	assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_course_video_view\(UUID, UUID\) FROM PUBLIC/);
	assert.match(
		sql,
		/GRANT EXECUTE ON FUNCTION public\.record_course_video_view\(UUID, UUID\) TO service_role/,
	);

	// Tumbling 30-minute window computed on the database clock.
	assert.match(sql, /extract\(epoch FROM clock_timestamp\(\)\) \/ 1800/);
	assert.match(
		sql,
		/INSERT INTO public\.video_view_events \(video_id, user_id, window_start\)/,
	);
	assert.match(sql, /ON CONFLICT \(video_id, user_id, window_start\) DO NOTHING/);

	// Fresh insert path must call the authoritative increment RPC before returning counted:true.
	const insertAt = sql.indexOf("INSERT INTO public.video_view_events");
	const incrementAt = sql.indexOf("public.increment_course_video_view_count(p_video_id)");
	const countedTrueAt = sql.indexOf("'counted', true");
	assert.ok(insertAt > -1 && incrementAt > insertAt, "insert must precede increment");
	assert.ok(countedTrueAt > incrementAt, "counted:true must follow the increment");

	// Duplicate path returns counted:false without calling the increment again.
	assert.match(sql, /IF v_inserted_id IS NULL THEN/);
	assert.match(sql, /'counted', false/);
	assert.equal(
		(sql.match(/increment_course_video_view_count\(p_video_id\)/g) ?? []).length,
		1,
		"increment must run exactly once, only on a fresh insert",
	);

	const helper = await read(HELPER);
	assert.match(helper, /export const VIEW_DEDUP_WINDOW_SECONDS = 30 \* 60;/);
	assert.match(helper, /srv\.rpc\("record_course_video_view"/);
	assert.ok(!helper.includes(".upsert("), "helper must not do a separate upsert");
	assert.ok(
		!helper.includes('rpc("increment_course_video_view_count"'),
		"helper must not call the counter RPC outside the atomic function",
	);
	assert.match(helper, /degraded: true/);
});

test("the list API exposes the aggregate only and no viewer data", async () => {
	const source = await read(LIST_ROUTE);

	const base = source.match(/const BASE_COLUMNS = "([^"]+)"/);
	assert.ok(base, "expected a BASE_COLUMNS constant");
	const baseColumns = base[1].split(",").map((c) => c.trim());
	for (const column of baseColumns) {
		assert.ok(
			!/user|viewer|email|profile/i.test(column),
			`list column ${column} must not identify a viewer`,
		);
	}

	assert.match(source, /const COLUMNS_WITH_VIEW_COUNT = `\$\{BASE_COLUMNS\}, view_count`;/);
	assert.ok(!source.includes("video_view_events"), "list route must not read the event table");
	assert.match(source, /isMissingViewCounterError\(withCounts\.error\)/);
	assert.match(source, /viewCountsAvailable: false/);
});

test("migrations define counter + events without seed, cron, or random history", async () => {
	const counter = sqlWithoutComments(await read(COUNTER_MIGRATION));
	assert.match(counter, /view_count BIGINT NOT NULL DEFAULT 0/);
	assert.match(counter, /course_videos_view_count_nonnegative/);
	assert.match(counter, /CREATE OR REPLACE FUNCTION public\.increment_course_video_view_count/);
	assert.match(counter, /GRANT EXECUTE ON FUNCTION public\.increment_course_video_view_count\(UUID\) TO service_role/);

	const events = sqlWithoutComments(await read(EVENTS_MIGRATION));
	assert.match(events, /CREATE TABLE IF NOT EXISTS public\.video_view_events/);
	assert.match(events, /CREATE UNIQUE INDEX IF NOT EXISTS video_view_events_dedup_idx/);
	assert.match(events, /ALTER TABLE public\.video_view_events ENABLE ROW LEVEL SECURITY/);
	assert.ok(!/ADD COLUMN[\s\S]*view_count/i.test(events), "events migration must not add view_count");
	assert.ok(
		!/CREATE OR REPLACE FUNCTION public\.increment_course_video_view_count/i.test(events),
		"events migration must not redefine the increment RPC",
	);

	for (const [name, sql] of [
		["counter", counter],
		["events", events],
	]) {
		assert.ok(!/random\s*\(/i.test(sql), `${name}: no randomised seed`);
		assert.ok(!/\bCRON\b/i.test(sql), `${name}: no scheduled job`);
		assert.ok(
			!/5000|9999|seed_view|bump_view/i.test(sql),
			`${name}: no fabricated history seeds`,
		);
	}

	const workflows = await readdir(new URL(".github/workflows", root));
	assert.ok(
		!workflows.some((file) => /bump|view.?count/i.test(file)),
		"no view-count bump workflow may be added",
	);
});

test("player reports a view only on the browser play event", async () => {
	const source = await read(PLAYER);

	assert.match(source, /onPlay=\{\(\) => \{\s*void reportViewOnPlay\(\);\s*\}\}/);
	assert.match(source, /method:\s*"POST"/);
	assert.match(source, /viewReportStateRef/);

	// URL fetch stays a GET (default) and must not POST during mount/load.
	const loadEffectAt = source.indexOf("async function run()");
	const playHandlerAt = source.indexOf("async function reportViewOnPlay()");
	assert.ok(loadEffectAt > -1 && playHandlerAt > -1);

	const loadBlock = source.slice(loadEffectAt, source.indexOf("return () => {", loadEffectAt));
	assert.ok(
		!/method:\s*["']POST["']/.test(loadBlock),
		"signed-URL load effect must not POST a view",
	);

	assert.match(
		source,
		/fetch\(playApi, \{ credentials: "include" \}\)/,
		"URL issuance remains a GET",
	);

	// Failures stay silent: no setError inside the view reporter.
	const reporter = source.slice(
		playHandlerAt,
		source.indexOf("async function reportProgress", playHandlerAt),
	);
	assert.ok(!reporter.includes("setError"), "view POST failures must not surface errors");
	assert.match(reporter, /viewReportStateRef\.current = "done"/);
	assert.ok(!/setInterval\([^\)]*reportViewOnPlay/.test(source), "no polling retry loop");
});
