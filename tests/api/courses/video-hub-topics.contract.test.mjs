// tests/api/courses/video-hub-topics.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public course-topics route lists active topics with courseCount", async () => {
	const source = await read("src/app/api/course-topics/route.ts");
	assert.match(source, /export async function GET/);
	assert.match(source, /is_active,\s*true|eq\("is_active",\s*true\)/);
	assert.match(source, /courseCount/);
	assert.match(source, /sort_order/);
	assert.doesNotMatch(source, /requireAdminSession|requireTradeUser/);
});

test("public courses route supports topicId filter and returns topic_id", async () => {
	const source = await read("src/app/api/courses/route.ts");
	assert.match(source, /topicId|topic_id/);
	assert.match(source, /searchParams/);
	assert.match(source, /z\.string\(\)\.uuid\(\)|uuid\(\)/);
});
