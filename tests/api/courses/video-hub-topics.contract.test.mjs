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

test("CoursesListClient hubs on topics and supports topic query param", async () => {
	const source = await read("src/components/courses/CoursesListClient.tsx");
	assert.match(source, /\/api\/course-topics/);
	assert.match(source, /topicId|searchParams/);
	assert.match(source, /hubTopicMessageKey|HUB_TOPIC_SORT|isLiveHubTopic/);
	assert.match(source, /hubLiveEmpty|backToHub/);
});

test("CoursesPage messages include hub keys", async () => {
	for (const locale of ["zh", "zh-TW", "en"]) {
		const json = JSON.parse(await read(`messages/${locale}.json`));
		const page = json.CoursesPage;
		for (const key of [
			"hubClassic",
			"hubRecorded",
			"hubLive",
			"hubClassicBlurb",
			"hubRecordedBlurb",
			"hubLiveBlurb",
			"hubLiveEmpty",
			"backToHub",
		]) {
			assert.equal(typeof page[key], "string", `${locale} missing ${key}`);
		}
	}
});
