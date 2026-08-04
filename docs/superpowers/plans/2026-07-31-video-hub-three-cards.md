# Video Hub Three Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/courses` into a three-card video hub (交易经典 / 录播教学 / 课程直播) backed by `course_topics`, with deep-linkable topic lists and a live “敬请期待” empty state.

**Architecture:** Seed three active hub topics and rebind courses via migration SQL. Add public `GET /api/course-topics` and `GET /api/courses?topicId=`. Replace the flat `CoursesListClient` first paint with hub cards; `?topic=<uuid>` shows the filtered course list (or live placeholder). i18n maps by fixed `sort_order` (10/20/30), not mutable DB titles.

**Tech Stack:** Next.js App Router, Supabase (`course_topics` / `courses`), next-intl, existing contract tests (`node:test` + source asserts).

## Global Constraints

- Entry stays `/courses` (homepage video entry unchanged); no new `/videos` route.
- Hub cards: 交易经典 = 豹哥+豹叔; 录播教学 = 第1–5课; 课程直播 = empty + 敬请期待.
- 「A股基础知识」must not appear in any hub list (`topic_id` null).
- Old topics inactivated after rebind; do not delete (avoid accidental nulling if order wrong).
- Public APIs remain guest-accessible (no auth wall).
- Do not change playback, enrollment, or payment in this plan.
- Spec: `docs/superpowers/specs/2026-07-31-video-hub-three-cards-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260731120000_video_hub_topics.sql` | Insert/upsert hub topics, rebind courses, deactivate old topics |
| `src/lib/courses/hub-topics.ts` | `HUB_TOPIC_SORT` constants + `hubTopicMessageKey(sortOrder)` |
| `src/app/api/course-topics/route.ts` | Public list of active topics (+ courseCount) |
| `src/app/api/courses/route.ts` | Optional `topicId` filter; include `topic_id` on rows |
| `src/components/courses/CoursesListClient.tsx` | Hub cards ↔ topic course list ↔ live placeholder |
| `messages/{zh,zh-TW,en}.json` | Hub copy keys under `CoursesPage` |
| `tests/api/courses/video-hub-topics.contract.test.mjs` | Contract tests for API + hub client + migration |
| `tests/migrations/video-hub-topics.contract.test.mjs` | Migration SQL shape + known course rebinds |

---

### Task 1: Hub topic constants + migration

**Files:**
- Create: `src/lib/courses/hub-topics.ts`
- Create: `supabase/migrations/20260731120000_video_hub_topics.sql`
- Create: `tests/migrations/video-hub-topics.contract.test.mjs`
- Test: `tests/migrations/video-hub-topics.contract.test.mjs`

**Interfaces:**
- Consumes: existing `course_topics` / `courses.topic_id`
- Produces:
  - `HUB_TOPIC_SORT = { classic: 10, recorded: 20, live: 30 } as const`
  - `hubTopicMessageKey(sortOrder: number): "hubClassic" | "hubRecorded" | "hubLive" | null`
  - Migration that creates active topics with those `sort_order` values and rebinds known course UUIDs

- [ ] **Step 1: Write the failing migration contract test**

```js
// tests/migrations/video-hub-topics.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/migrations/video-hub-topics.contract.test.mjs`  
Expected: FAIL (migration file missing)

- [ ] **Step 3: Add hub-topics helper**

```ts
// src/lib/courses/hub-topics.ts
export const HUB_TOPIC_SORT = {
	classic: 10,
	recorded: 20,
	live: 30,
} as const;

export type HubTopicMessageKey = "hubClassic" | "hubRecorded" | "hubLive";

export function hubTopicMessageKey(sortOrder: number): HubTopicMessageKey | null {
	if (sortOrder === HUB_TOPIC_SORT.classic) return "hubClassic";
	if (sortOrder === HUB_TOPIC_SORT.recorded) return "hubRecorded";
	if (sortOrder === HUB_TOPIC_SORT.live) return "hubLive";
	return null;
}

export function isLiveHubTopic(sortOrder: number): boolean {
	return sortOrder === HUB_TOPIC_SORT.live;
}
```

- [ ] **Step 4: Write migration SQL**

```sql
-- supabase/migrations/20260731120000_video_hub_topics.sql
-- Video hub: three front-door topics. Idempotent enough for re-run on title+sort_order.

INSERT INTO public.course_topics (title, description, sort_order, is_active)
SELECT v.title, v.description, v.sort_order, true
FROM (VALUES
  ('交易经典', '豹哥与豹叔经典内容', 10),
  ('录播教学', '系统录播课程', 20),
  ('课程直播', '直播课程敬请期待', 30)
) AS v(title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.course_topics t
  WHERE t.sort_order = v.sort_order AND t.is_active = true AND t.title = v.title
);

-- Ensure the three hub rows are active with expected titles (if sort_order already used).
UPDATE public.course_topics t
SET title = v.title,
    description = v.description,
    is_active = true
FROM (VALUES
  (10, '交易经典', '豹哥与豹叔经典内容'),
  (20, '录播教学', '系统录播课程'),
  (30, '课程直播', '直播课程敬请期待')
) AS v(sort_order, title, description)
WHERE t.sort_order = v.sort_order;

-- Rebind courses by known production IDs.
UPDATE public.courses
SET topic_id = (SELECT id FROM public.course_topics WHERE sort_order = 10 AND is_active = true ORDER BY created_at LIMIT 1)
WHERE id IN (
  '9ea59ef3-2f1f-4d61-be3f-29b7cc664084',
  '78cc57c5-6b1c-462a-b8c6-ed5ceb5e14fb'
);

UPDATE public.courses
SET topic_id = (SELECT id FROM public.course_topics WHERE sort_order = 20 AND is_active = true ORDER BY created_at LIMIT 1)
WHERE id IN (
  '5da6f2fa-4e98-4bcf-ae3a-378da4302b07',
  'cf934e87-90ba-47c5-baab-6c1bf434ddb4',
  '3f9c2852-bb6a-48d1-a22f-51242e253dd5',
  '1f7546e5-0684-4570-953c-686c90800c30',
  '71e9740f-847d-4c3f-97fe-7acf7ea32932'
);

UPDATE public.courses
SET topic_id = NULL
WHERE id = 'c40fbe73-08d7-465a-bacd-9b4d8978dfdf';

-- Deactivate legacy topics that are not the hub trio.
UPDATE public.course_topics
SET is_active = false
WHERE sort_order NOT IN (10, 20, 30)
   OR title IN ('股票交易', '豹哥·交易新銳', '豹叔·交易經典');
```

Note: If production already has active rows with sort_order 10/20/30 under different titles, the `UPDATE ... WHERE t.sort_order = v.sort_order` renames them to hub titles. Confirm before apply if custom topics use those sort_orders.

- [ ] **Step 5: Run migration contract test**

Run: `node --test tests/migrations/video-hub-topics.contract.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/courses/hub-topics.ts \
  supabase/migrations/20260731120000_video_hub_topics.sql \
  tests/migrations/video-hub-topics.contract.test.mjs
git commit -m "$(cat <<'EOF'
feat(courses): seed video hub topics migration

Add sort_order 10/20/30 hub topics and rebind classic/recorded courses.
EOF
)"
```

---

### Task 2: Public course-topics API + courses `topicId` filter

**Files:**
- Create: `src/app/api/course-topics/route.ts`
- Modify: `src/app/api/courses/route.ts`
- Create: `tests/api/courses/video-hub-topics.contract.test.mjs`
- Test: `tests/api/courses/video-hub-topics.contract.test.mjs`

**Interfaces:**
- Consumes: `getServiceSupabase()`, hub topics in DB
- Produces:
  - `GET /api/course-topics` → `{ topics: Array<{ id, title, description, sort_order, courseCount }> }` ordered by `sort_order` asc then `created_at` asc; only `is_active=true`
  - `GET /api/courses?topicId=<uuid>` → existing `{ courses }` shape plus each row includes `topic_id`; invalid uuid → 400; filters `eq("topic_id", topicId)` and `eq("is_active", true)`

- [ ] **Step 1: Write failing API contract tests**

```js
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/api/courses/video-hub-topics.contract.test.mjs`  
Expected: FAIL (route missing / no topicId)

- [ ] **Step 3: Implement `GET /api/course-topics`**

```ts
// src/app/api/course-topics/route.ts
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	const { data: topics, error } = await srv
		.from("course_topics")
		.select("id, title, description, sort_order")
		.eq("is_active", true)
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const ids = (topics ?? []).map((t) => t.id as string);
	let counts = new Map<string, number>();
	if (ids.length) {
		const { data: courses } = await srv
			.from("courses")
			.select("topic_id")
			.eq("is_active", true)
			.in("topic_id", ids);
		counts = new Map();
		for (const row of courses ?? []) {
			const tid = row.topic_id as string | null;
			if (!tid) continue;
			counts.set(tid, (counts.get(tid) ?? 0) + 1);
		}
	}

	return NextResponse.json({
		topics: (topics ?? []).map((t) => ({
			...t,
			courseCount: counts.get(t.id as string) ?? 0,
		})),
	});
}
```

- [ ] **Step 4: Extend `GET /api/courses`**

In `src/app/api/courses/route.ts`:

1. Change signature to `export async function GET(request: Request)`.
2. Parse `topicId` from `new URL(request.url).searchParams`.
3. If present and not a UUID → `400 { error: "topicId 无效" }`.
4. Add `topic_id` to both `baseSelect` and `withInstructorIdSelect`.
5. After building the query (`.eq("is_active", true)`), if `topicId` set → `.eq("topic_id", topicId)`.
6. Keep instructor label enrichment; each course object must include `topic_id`.

If selecting `topic_id` fails on ancient DBs without the column, mirror the existing instructor_id fallback pattern: retry without `topic_id` only when error message indicates missing column; otherwise return 500. Prefer simple path (column already exists in prod).

- [ ] **Step 5: Run API contract tests**

Run: `node --test tests/api/courses/video-hub-topics.contract.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/course-topics/route.ts \
  src/app/api/courses/route.ts \
  tests/api/courses/video-hub-topics.contract.test.mjs
git commit -m "$(cat <<'EOF'
feat(courses): public topics API and topicId course filter

Expose active hub topics with courseCount; filter /api/courses by topic.
EOF
)"
```

---

### Task 3: i18n + CoursesListClient hub UI

**Files:**
- Modify: `messages/zh.json` (`CoursesPage`)
- Modify: `messages/zh-TW.json` (`CoursesPage`)
- Modify: `messages/en.json` (`CoursesPage`)
- Modify: `src/components/courses/CoursesListClient.tsx`
- Modify: `tests/api/courses/video-hub-topics.contract.test.mjs` (add UI asserts)
- Test: `tests/api/courses/video-hub-topics.contract.test.mjs`

**Interfaces:**
- Consumes: `GET /api/course-topics`, `GET /api/courses?topicId=`, `hubTopicMessageKey`, `isLiveHubTopic`, `useSearchParams` / `useRouter` from next/navigation + i18n `Link`
- Produces: Hub-first `/courses` UX; URL `?topic=<uuid>` for deep links

**Message keys to add under `CoursesPage`:**

| Key | zh | zh-TW | en |
|-----|----|-------|-----|
| `hubClassic` | 交易经典 | 交易經典 | Trading Classics |
| `hubRecorded` | 录播教学 | 錄播教學 | Recorded Lessons |
| `hubLive` | 课程直播 | 課程直播 | Live Classes |
| `hubClassicBlurb` | 豹哥与豹叔经典内容 | 豹哥與豹叔經典內容 | Classics from Baoge and Baoshu |
| `hubRecordedBlurb` | 系统录播课程，支持免费试看 | 系統錄播課程，支援免費試看 | Recorded courses with free preview |
| `hubLiveBlurb` | 敬请期待 | 敬請期待 | Coming soon |
| `hubLiveEmpty` | 敬请期待 | 敬請期待 | Coming soon |
| `backToHub` | ← 返回分区 | ← 返回分區 | ← Back to topics |
| `hubLoadError` | 分区加载失败 | 分區載入失敗 | Failed to load topics |

- [ ] **Step 1: Extend contract test for client + messages**

Append to `tests/api/courses/video-hub-topics.contract.test.mjs`:

```js
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
```

- [ ] **Step 2: Run — expect FAIL on missing keys / client behavior**

Run: `node --test tests/api/courses/video-hub-topics.contract.test.mjs`  
Expected: FAIL

- [ ] **Step 3: Add i18n keys** to `messages/zh.json`, `zh-TW.json`, `en.json` under `CoursesPage` using the table above.

- [ ] **Step 4: Rewrite `CoursesListClient` UX**

Behavior:

1. On mount, fetch `/api/course-topics`.
2. Read `topic` from `useSearchParams()` (UUID).
3. If no `topic` (or topic not in active list): render three hub cards from topics (map label/blurb via `hubTopicMessageKey(sort_order)`; fallback to DB `title` / `description` if key null). Card click → `router.push(`/courses?topic=${id}`)` (use locale-aware navigation if the project uses `useRouter` from `@/i18n/navigation`).
4. If `topic` selected:
   - Show `backToHub` link clearing the query (`/courses`).
   - If `isLiveHubTopic(sort_order)` OR `courseCount === 0` for live sort_order 30: show `hubLiveEmpty` only (no course fetch required for empty live; still OK to fetch and show empty).
   - Else fetch `/api/courses?topicId=${topic}` and render the existing course card list UI (title/mode/date/view/registration badges).
5. Keep registration status fetch for authed users when showing a course list.
6. Invalid topic UUID or unknown id: treat as hub home (no hard error, optional `hubLoadError` only on network failure).

Keep types:

```ts
type TopicRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  courseCount: number;
};

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  mode: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  topic_id?: string | null;
};
```

Do not wrap hub cards in heavy card chrome beyond existing `rounded-xl border` list style; one job per view (hub vs list).

- [ ] **Step 5: Run contracts**

Run: `node --test tests/api/courses/video-hub-topics.contract.test.mjs tests/migrations/video-hub-topics.contract.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add messages/zh.json messages/zh-TW.json messages/en.json \
  src/components/courses/CoursesListClient.tsx \
  src/lib/courses/hub-topics.ts \
  tests/api/courses/video-hub-topics.contract.test.mjs
git commit -m "$(cat <<'EOF'
feat(courses): three-card video hub on /courses

Hub cards by topic sort_order; deep-link lists; live coming-soon empty state.
EOF
)"
```

---

### Task 4: Apply data on production + smoke

**Files:**
- None in repo beyond verifying migration applied (use Supabase SQL / `apply_migration`)

**Interfaces:**
- Consumes: migration from Task 1
- Produces: production topics + bindings matching acceptance table

- [ ] **Step 1: Apply migration to project `bpuqqyqmrtchaqfouygm`**

Use Supabase MCP `apply_migration` with the SQL body from `20260731120000_video_hub_topics.sql`, name `video_hub_topics`.

- [ ] **Step 2: Verify SQL**

```sql
SELECT id, title, sort_order, is_active FROM course_topics ORDER BY sort_order;
SELECT c.title, t.title AS topic, t.sort_order
FROM courses c
LEFT JOIN course_topics t ON t.id = c.topic_id
WHERE c.is_active = true
ORDER BY t.sort_order NULLS LAST, c.title;
```

Expect: three active hub topics; 豹哥+豹叔 → sort 10; 五门录播 → sort 20; A股基础知识 → null topic; 课程直播 courseCount 0.

- [ ] **Step 3: HTTP smoke (after deploy or local with prod DB)**

```bash
curl -sS https://leolearnstotrade.com/api/course-topics | python3 -m json.tool
curl -sS "https://leolearnstotrade.com/api/courses?topicId=<classic-uuid>" | python3 -c 'import sys,json; print([c["title"] for c in json.load(sys.stdin)["courses"]])'
```

Expect classic list length 2; recorded length 5; live empty / coming soon in UI.

- [ ] **Step 4: Commit** (only if any ops checklist doc was added; otherwise skip empty commit)

No code commit required if Task 3 already landed. Optionally update spec status line to `已实现` in a docs commit when shipping:

```bash
git add docs/superpowers/specs/2026-07-31-video-hub-three-cards-design.md
git commit -m "docs: mark video hub three-cards spec implemented"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Three hub topics + rebind | Task 1 + 4 |
| Deactivate old topics | Task 1 |
| A股基础知识 out of hub | Task 1 |
| `GET /api/course-topics` + courseCount | Task 2 |
| `GET /api/courses?topicId=` + `topic_id` | Task 2 |
| `/courses` three cards | Task 3 |
| Classic / recorded lists | Task 3 + 4 |
| Live 敬请期待 | Task 3 |
| Deep link `?topic=` | Task 3 |
| i18n via sort_order keys | Task 1 helper + Task 3 |
| No `/videos` route | Global / Task 3 |
| Playback unchanged | Global |

## Self-review notes

- No TBD/placeholder steps.
- `hubTopicMessageKey` / `isLiveHubTopic` names consistent across Task 1 and 3.
- Migration uses production course UUIDs from current DB snapshot (2026-07-31).
