import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

const LOCALES = ["messages/en.json", "messages/zh-TW.json", "messages/zh.json"];

const TOPIC_KEYS = [
	"courseTopicsTitle",
	"courseTopicsSubtitle",
	"courseTopicName",
	"courseTopicDescription",
	"courseTopicAdd",
	"courseTopicEmpty",
	"courseTopicActive",
	"courseTopicInactive",
	"courseTopicEnable",
	"courseTopicDisable",
	"courseTopicMoveUp",
	"courseTopicMoveDown",
	"courseTopicField",
	"courseTopicNone",
	"courseTopicMissing",
	"courseTopicUnavailable",
	"courseTopicColumn",
];

test("course detail select offers active topics plus a bound disabled topic", async () => {
	const source = await read("src/components/admin/AdminCourseDetailClient.tsx");
	assert.match(source, /const activeTopics = topics\.filter\(\(topic\) => topic\.is_active\)/);
	assert.match(
		source,
		/const topicOptions = boundTopic && !boundTopic\.is_active \? \[\.\.\.activeTopics, boundTopic\] : activeTopics/,
	);
	assert.match(source, /\{topicOptions\.map\(\(topic\) => \(/);
	// The disabled-but-bound option is labelled, so it stays visible and clearable.
	assert.match(source, /topic\.is_active \? topic\.title : `\$\{topic\.title\}（\$\{t\("courseTopicInactive"\)\}）`/);
	assert.match(source, /<option value="">\{t\("courseTopicNone"\)\}<\/option>/);
	assert.match(source, /boundTopicMissing \? <option value=\{topicId\}>\{t\("courseTopicMissing"\)\}<\/option>/);
});

test("course detail clears the topic with an explicit null payload", async () => {
	const source = await read("src/components/admin/AdminCourseDetailClient.tsx");
	assert.match(source, /if \(!topicsUnavailable\) payload\.topic_id = topicId \? topicId : null;/);
	assert.match(source, /body: JSON\.stringify\(payload\)/);
	// Migration/API failure must degrade safely instead of faking a topic write.
	assert.match(source, /setTopicsUnavailable\(!topicRes\.ok\)/);
	assert.match(source, /disabled=\{topicsUnavailable\}/);
	assert.match(source, /\{t\("courseTopicUnavailable"\)\}/);
	assert.match(source, /setTopicId\(data\.course\.topic_id \?\? ""\)/);
});

test("courses panel manages topics through the admin course-topics API", async () => {
	const source = await read("src/components/admin/AdminCoursesPanel.tsx");
	assert.match(source, /fetch\("\/api\/admin\/course-topics", \{ credentials: "include" \}\)/);
	assert.match(source, /await callTopicApi\("\/api\/admin\/course-topics", \{\s*method: "POST"/);
	assert.match(source, /`\/api\/admin\/course-topics\/\$\{id\}`, \{\s*method: "PATCH"/);
	assert.match(source, /`\/api\/admin\/course-topics\/\$\{id\}`, \{ method: "DELETE" \}/);
	assert.match(source, /patchTopic\(topic\.id, \{ is_active: !topic\.is_active \}\)/);
	assert.match(source, /body: JSON\.stringify\(\{ sort_order: i \}\)/);
	// The create form only offers active topics.
	assert.match(source, /const activeTopics = topics\.filter\(\(topic\) => topic\.is_active\)/);
	assert.match(source, /if \(courseTopicId\) payload\.topic_id = courseTopicId;/);
});

test("course write APIs accept a nullable uuid topic binding", async () => {
	const collection = await read("src/app/api/admin/courses/route.ts");
	assert.match(collection, /topic_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
	assert.match(collection, /assertActiveCourseTopic/);
	assert.match(collection, /if \(parsed\.data\.topic_id !== undefined\) \{/);
	assert.match(collection, /insert\.topic_id = parsed\.data\.topic_id;/);

	const item = await read("src/app/api/admin/courses/[courseId]/route.ts");
	assert.match(item, /topic_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
	assert.match(item, /assertActiveCourseTopic/);
	// The strict patch schema spreads parsed data, so an explicit null clears the column.
	assert.match(item, /const updates: Record<string, unknown> = \{ \.\.\.parsed\.data \};/);
	// Omitting topic_id leaves the existing binding untouched (including inactive).
	assert.match(
		item,
		/if \(parsed\.data\.topic_id !== undefined && parsed\.data\.topic_id !== null\)/,
	);
});

test("non-null topic bindings require an existing active topic", async () => {
	const helper = await read("src/lib/courses/assert-active-topic.ts");
	assert.match(helper, /export async function assertActiveCourseTopic/);
	assert.match(helper, /\.from\("course_topics"\)/);
	assert.match(helper, /\.select\("id, is_active"\)/);
	assert.match(helper, /error: "Topic not found"/);
	assert.match(helper, /error: "Topic is inactive"/);
	assert.match(helper, /status: 400/);
	assert.match(helper, /!data\.is_active/);

	const collection = await read("src/app/api/admin/courses/route.ts");
	const item = await read("src/app/api/admin/courses/[courseId]/route.ts");
	// null clears without calling the active-topic gate.
	assert.match(collection, /if \(parsed\.data\.topic_id !== null\) \{\s*const topicGate = await assertActiveCourseTopic/);
	assert.match(item, /parsed\.data\.topic_id !== null\) \{\s*const topicGate = await assertActiveCourseTopic/);
});

test("course topic keys exist in every locale without touching label strings", async () => {
	for (const locale of LOCALES) {
		const messages = await readJson(locale);
		for (const key of TOPIC_KEYS) {
			const value = messages.Admin?.[key];
			assert.equal(typeof value, "string", `${locale} is missing Admin.${key}`);
			assert.ok(value.trim().length > 0, `${locale} has an empty Admin.${key}`);
		}
		assert.equal(typeof messages.Admin.courseTeaserLabelContent, "string");
		assert.equal(typeof messages.Admin.refundReasonLabel, "string");
	}
});

test("approved product names are used per locale", async () => {
	const en = await readJson("messages/en.json");
	const zhTW = await readJson("messages/zh-TW.json");
	const zh = await readJson("messages/zh.json");
	assert.equal(en.Admin.courseTopicsTitle, "Course Topics");
	assert.equal(zhTW.Admin.courseTopicsTitle, "課程主題");
	assert.equal(zh.Admin.courseTopicsTitle, "课程主题");
});
