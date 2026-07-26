import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("collection route guards, validates, and returns stable ordering", async () => {
	const source = await read("src/app/api/admin/course-topics/route.ts");
	assert.match(source, /export async function GET/);
	assert.match(source, /export async function POST/);
	assert.match(source, /requireAdminSession\(\)/);
	assert.match(source, /z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)/);
	assert.match(source, /\.order\("sort_order", \{ ascending: true \}\)/);
	assert.match(source, /\.order\("created_at", \{ ascending: true \}\)/);
});

test("item route guards, validates ids and supports safe update/delete", async () => {
	const source = await read("src/app/api/admin/course-topics/[id]/route.ts");
	assert.match(source, /export async function PATCH/);
	assert.match(source, /export async function DELETE/);
	assert.match(source, /const topicIdSchema = z\.string\(\)\.uuid\(\)/);
	assert.match(source, /requireAdminSession\(\)/);
	assert.match(source, /Object\.keys\(parsed\.data\)\.length === 0/);
	assert.match(source, /\.delete\(\)\.eq\("id", id\)\.select\("id"\)\.maybeSingle\(\)/);
});

test("migration preserves courses when a topic is deleted", async () => {
	const sql = await read("supabase/migrations/20260725100000_course_topics.sql");
	assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.course_topics/);
	assert.match(sql, /title TEXT NOT NULL CHECK \(char_length\(btrim\(title\)\) > 0\)/);
	assert.match(sql, /topic_id UUID REFERENCES public\.course_topics\(id\) ON DELETE SET NULL/);
	assert.match(sql, /ALTER TABLE public\.course_topics ENABLE ROW LEVEL SECURITY/);
});
