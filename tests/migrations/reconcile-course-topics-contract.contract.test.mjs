import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const ORIGINAL_TOPICS = "supabase/migrations/20260725100000_course_topics.sql";
const PREFIX = "20260726";
const NAME_HINT = "reconcile_course_topics_contract";

function sqlWithoutComments(sql) {
	return sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n");
}

async function findReconcileMigration() {
	const dir = new URL("supabase/migrations/", root);
	const files = (await readdir(dir))
		.filter((f) => f.endsWith(".sql") && f.includes(NAME_HINT))
		.sort();
	assert.ok(files.length >= 1, `expected a migration named *${NAME_HINT}*`);
	const name = files[files.length - 1];
	assert.ok(
		name.startsWith(PREFIX) || name > "20260726120000_course_video_marketing_view_count.sql",
		"reconcile migration timestamp must be later than marketing migration 20260726120000",
	);
	assert.ok(
		name > "20260726120000_course_video_marketing_view_count.sql",
		"reconcile migration must sort after 20260726120000",
	);
	return `supabase/migrations/${name}`;
}

test("reconcile migration fails loud on blank titles and never silently mutates rows", async () => {
	const path = await findReconcileMigration();
	const raw = await read(path);
	const sql = sqlWithoutComments(raw);

	assert.match(raw, /production schema\/history drift reconciliation/i);
	assert.match(raw, /20260725100000_course_topics\.sql/);
	assert.match(sql, /RAISE EXCEPTION/i);
	assert.match(sql, /char_length\s*\(\s*btrim\s*\(\s*title\s*\)\s*\)\s*=\s*0/);
	assert.ok(!/\bUPDATE\b/i.test(sql), "must not UPDATE existing rows");
	assert.ok(!/\bDELETE\b/i.test(sql), "must not DELETE existing rows");
	assert.ok(!/\bINSERT\b/i.test(sql), "must not INSERT seed/backfill rows");
});

test("title CHECK is idempotent and bound to public.course_topics", async () => {
	const path = await findReconcileMigration();
	const sql = sqlWithoutComments(await read(path));

	assert.match(sql, /course_topics_title_nonempty/);
	assert.match(sql, /conrelid\s*=\s*'public\.course_topics'::regclass/);
	assert.match(
		sql,
		/ADD CONSTRAINT\s+course_topics_title_nonempty\s+CHECK\s*\(\s*char_length\s*\(\s*btrim\s*\(\s*title\s*\)\s*\)\s*>\s*0\s*\)/,
	);
	assert.ok(
		!/WHERE\s+conname\s*=\s*'course_topics_title_nonempty'\s*;/.test(sql.replace(/\s+/g, " ")),
		"must not look up constraint by name alone without conrelid",
	);
});

test("legacy public read policy is dropped idempotently", async () => {
	const path = await findReconcileMigration();
	const sql = sqlWithoutComments(await read(path));

	assert.match(
		sql,
		/DROP POLICY IF EXISTS\s+"public read active topics"\s+ON\s+public\.course_topics\s*;/,
	);
	assert.ok(!/CREATE POLICY/i.test(sql), "must not add any new public policy");
});

test("reconcile migration stays scoped and leaves original #2 untouched", async () => {
	const path = await findReconcileMigration();
	const sql = sqlWithoutComments(await read(path));
	const original = await read(ORIGINAL_TOPICS);

	assert.match(original, /CREATE TABLE IF NOT EXISTS public\.course_topics/);
	assert.ok(!/\bview_count\b/i.test(sql), "must not touch view_count");
	assert.ok(!/\bBIGINT\b/i.test(sql), "must not alter numeric types");
	assert.ok(!/\bcontent_kind\b/i.test(sql), "must not modify content_kind");
	assert.ok(!/\bALTER COLUMN\b/i.test(sql), "must not alter columns");
	assert.ok(!/\bseed\b|\bbackfill\b/i.test(sql), "no seed/backfill");
	assert.ok(
		!/api[_-]?key|secret|password|token|service_role/i.test(sql),
		"must not embed secrets",
	);
});
