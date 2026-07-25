#!/usr/bin/env node
/**
 * 豹哥 · 交易新銳 — 搜尋當前最火熱交易員的人物故事影片
 *
 * 優先級：本人親述（X/Reddit/YouTube）> AI 量化前沿 > 權威解讀
 *
 * 用法:
 *   node scripts/ai-pipeline/search-and-process.mjs
 *
 * 环境变量:
 *   OPENAI_API_KEY
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY
 */

import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");

async function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, supabaseKey);
}

async function searchVideos() {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o-search-preview",
    messages: [
      {
        role: "system",
        content: `You are 豹哥 (Brother Leopard), the trading edge curator for TradeLovin, a Chinese knowledge-paywall platform.
Your persona: Bobby Axelrod from "Billions" — sharp, confident, sees through the noise.

Search objective: Find 1-2 HIGH QUALITY recent videos about the hottest, most cutting-edge trading content with a "character arc" — every story needs the trader's trading style, their rise, and the adversity they faced.

PRIORITY 1 (trader's own story — highest priority):
- Recently viral traders/fund managers telling their OWN story in their OWN voice
- Must have: their trading style + how they rose + what adversity they faced (or didn't overcome)
- Sources: YouTube, X/Twitter video posts, Reddit AMA/trade breakdown videos
- Keywords: trader tells his story, how I made my first million trading, trader comeback story, my biggest trading loss, from zero to fund manager, trader origin story, how I blew up my account

PRIORITY 2 (deep interviews + real trade breakdowns):
- In-depth interviews with traders/fund managers (not news clips)
- The trader personally breaking down a signature trade
- Keywords: trader interview deep dive, trade breakdown by the trader himself, hedge fund manager story, quant trader journey

PRIORITY 3 (AI/quant frontier — with human story):
- Quant traders telling how they moved from discretionary to AI/quant
- Traders who built AI trading systems and succeeded — in their own words
- Keywords: how I built my AI trading system, my journey into quantitative trading, machine learning trader story

HARD RULES:
- The trader MUST appear or speak in their own voice
- MUST have a human story arc (not a pure tutorial)
- Published in last 60 days
- Under 15 minutes
- REJECT: pure hype, price predictions, technical indicator tutorials (MACD lessons, candlestick 101, etc.)

Return JSON: { "videos": [{ "url": "youtube_url", "title": "...", "channel": "...", "duration_min": 8, "reason": "...", "topic": "...", "has_personal_story": true }] }`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}

async function getOrCreateNewEdgeCourse(supabase) {
  // 尋找或創建「交易新銳」主題下的課程
  const { data: topics } = await supabase
    .from("course_topics")
    .select("id, title")
    .ilike("title", "%交易新%")
    .eq("content_kind", "ai_classic")
    .eq("is_active", true)
    .limit(1);

  let topicId;
  if (topics?.length) {
    topicId = topics[0].id;
    // 找該 topic 下的活躍課程
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("topic_id", topicId)
      .eq("is_active", true)
      .limit(1);
    if (courses?.length) return courses[0].id;
  } else {
    // 如果主題不存在，先建一個
    const { data: topic, error: topicErr } = await supabase
      .from("course_topics")
      .insert({
        title: "交易新銳",
        description: "豹哥精選：AI量化前沿 + 當代最火交易員人物故事。本人親述交易風格、崛起之路、困境與頓悟。",
        sort_order: 1,
        is_active: true,
        content_kind: "ai_classic",
      })
      .select("id")
      .maybeSingle();

    if (topicErr) {
      console.error("建立交易新銳主題失敗:", topicErr.message);
      process.exit(1);
    }
    topicId = topic.id;
  }

  // 建立課程
  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      title: "交易新銳",
      description: "豹哥帶你看交易最前沿。AI量化、當代最火交易員親述策略與故事。每段≤3分鐘，豹哥中文字幕配音。\n\n免責聲明：本影片由 AI 加工製作（中譯配音），原始內容來自海外公開平台，僅供學習參考。版權歸原作者所有。",
      mode: "online",
      is_active: true,
      topic_id: topicId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("建立交易新銳課程失敗:", error.message);
    process.exit(1);
  }
  return course.id;
}

async function main() {
  console.log("豹哥 · 交易新銳 — 搜索當前最火熱的交易人物故事...");
  const result = await searchVideos();
  const videos = result.videos ?? [];

  if (!videos.length) {
    console.log("未找到符合条件的视频");
    process.exit(0);
  }

  const supabase = await getSupabase();
  const courseId = await getOrCreateNewEdgeCourse(supabase);
  console.log(`目標課程 ID: ${courseId}`);

  for (const video of videos.slice(0, 2)) {
    console.log(`\n處理: ${video.title}`);
    console.log(`  來源: ${video.channel}`);
    console.log(`  理由: ${video.reason}`);

    await new Promise((resolvePromise) => {
      const proc = spawn("node", [
        `${ROOT}/scripts/ai-pipeline/process-video.mjs`,
        "--url", video.url,
        "--course-id", courseId,
        "--topic", video.topic || "",
        "--source-platform", "youtube",
        "--content-kind", "ai_classic",
      ], { stdio: "inherit", timeout: 600000 });
      proc.on("close", (code) => {
        if (code !== 0) console.error(`  処理失败 (exit ${code})，继续下一个...`);
        resolvePromise();
      });
      proc.on("error", (err) => {
        console.error(`  进程错误: ${err.message}`);
        resolvePromise();
      });
    });
  }

  console.log("\n交易新銳搜索与加工完成!");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
