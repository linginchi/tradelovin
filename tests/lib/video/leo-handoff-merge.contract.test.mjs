import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
	join(process.cwd(), "src/lib/video/publish-status.ts"),
	"utf8",
);

test("publish-status helpers define draft/live/scheduled semantics", () => {
	assert.match(src, /export type PublishStatus = "draft" \| "scheduled" \| "live"/);
	assert.match(src, /if \(!publishedAt\) return false/);
	assert.match(src, /if \(t > now\.getTime\(\)\) return "scheduled"/);
	assert.match(src, /return "live"/);
});

test("published_at migration backfills existing rows and documents NULL=draft", () => {
	const mig = readFileSync(
		join(process.cwd(), "supabase/migrations/20260804120000_course_videos_published_at.sql"),
		"utf8",
	);
	assert.match(mig, /ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ/);
	assert.match(mig, /SET published_at = COALESCE\(created_at, NOW\(\)\)/);
	assert.match(mig, /WHERE published_at IS NULL/);
	assert.match(mig, /NULL=draft/);
});

test("home keeps four entries and uses optimized home_hero_v1 assets", () => {
	const page = readFileSync(join(process.cwd(), "src/lib/site/home-hero-assets.ts"), "utf8");
	const hero = readFileSync(join(process.cwd(), "src/components/home/HomeHeroBackground.tsx"), "utf8");
	assert.match(page, /home_hero_v1\.webp/);
	assert.match(page, /home_hero_v1\.png/);
	assert.match(hero, /object-\[center_35%\]/);
	const client = readFileSync(join(process.cwd(), "src/components/home/HomePageClient.tsx"), "utf8");
	assert.match(client, /href: "\/courses"/);
	assert.match(client, /href: "\/trade"/);
	assert.match(client, /href: "\/lab"/);
	assert.match(client, /href: "\/my-learning"/);
	assert.doesNotMatch(client, /leopards-loop\.mp4/);
});

test("leo-004 pipeline inserts draft published_at null with handoff voice", () => {
	const pipeline = readFileSync(
		join(process.cwd(), "scripts/test/leo-004/pipeline.mjs"),
		"utf8",
	);
	assert.match(pipeline, /published_at:\s*null/);
	assert.match(pipeline, /zh_male_taocheng_uranus_bigtts/);
	assert.match(pipeline, /uncle_bao_master_v2\.png/);
});

test("admin video publish desk is wired", () => {
	const shell = readFileSync(join(process.cwd(), "src/components/admin/AdminShell.tsx"), "utf8");
	assert.match(shell, /video-publish/);
	assert.match(shell, /navVideoPublish/);
	const panel = readFileSync(
		join(process.cwd(), "src/components/admin/AdminVideoPublishPanel.tsx"),
		"utf8",
	);
	assert.match(panel, /立即发布/);
	assert.match(panel, /\/api\/admin\/videos/);
});
