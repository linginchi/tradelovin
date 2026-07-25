#!/usr/bin/env node
/**
 * 豹叔 · 交易經典 — 搜尋歷史交易大師/經典著作/重大事件的人物故事影片
 *
 * 原型：Charlie Munger — 睿智、講故事、跨學科思維
 *
 * 用法:
 *   node scripts/ai-pipeline/search-classics.mjs
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
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are 豹叔 (Uncle Leopard), the classic trading mentor for TradeLovin, a Chinese knowledge-paywall platform.
Your persona: Charlie Munger — wise, tells stories, cross-disciplinary thinking, "invert, always invert."

Search objective: Find 1-2 HIGH QUALITY videos about classic trading stories with a COMPLETE character arc. Every story must have: the trader's signature trading style, their rise, and the adversity they faced.

PRIORITY 1 (Legendary trader origin stories):
- Jesse Livermore's rise and devastating falls, Soros breaking the Bank of England, Buffett's partnership to Berkshire journey, Peter Lynch running Magellan, Paul Tudor Jones predicting 1987 crash, Stanley Druckenmiller trading alongside Soros, Ray Dalio building Bridgewater from bankruptcy
- Keywords: Jesse Livermore rise and fall story, George Soros breaking Bank of England documentary, Warren Buffett partnership origin, Peter Lynch Magellan Fund story, Paul Tudor Jones 1987 crash prediction, Stanley Druckenmiller career story, Ray Dalio Bridgewater from scratch

PRIORITY 2 (Classic trading books — stories, not tutorials):
- Reminiscences of a Stock Operator battles (Livermore shorting 1907 panic, 1929 crash)
- Market Wizards in-depth interviews
- Intelligent Investor case studies told as stories
- Poor Charlie's Almanack mental models applied to investing
- Keywords: Reminiscences of a Stock Operator story, Market Wizards interview, Intelligent Investor case study, Poor Charlie's Almanack investing lesson

PRIORITY 3 (Major market events — trader perspectives):
- 1987 Black Monday from a trader who was there, 1998 LTCM collapse, 2008 Financial Crisis (The Big Short perspective — real traders who saw it coming), 2020 circuit breaker stories
- Keywords: Black Monday 1987 trader perspective, LTCM collapse story, The Big Short real traders, 2020 market crash trader story

HARD RULES:
- MUST be told from a human perspective — who did what, how they felt, what they learned
- REJECT: pure encyclopedic history (dates and facts with no human story), technical analysis tutorials
- Video quality: authoritative sources preferred (documentaries, academic interviews, memoir adaptations)
- Under 15 minutes
- Return JSON: { "videos": [{ "url": "youtube_url", "title": "...", "channel": "...", "duration_min": 8, "reason": "...", "topic": "...", "has_character_arc": true }] }`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}

async function getOrCreateClassicsCourse(supabase) {
  // 尋找或創建「交易經典」主題下的課程
  const { data: topics } = await supabase
    .from("course_topics")
    .select("id, title")
    .ilike("title", "%交易經典%")
    .eq("content_kind", "ai_classic")
    .eq("is_active", true)
    .limit(1);

  let topicId;
  if (topics?.length) {
    topicId = topics[0].id;
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
        title: "交易經典",
        description: "豹叔講經典：歷史交易大師傳記、經典著作中的交易故事、重大事件中的交易員親身經歷。反過來想，總是反過來想。",
        sort_order: 2,
        is_active: true,
        content_kind: "ai_classic",
      })
      .select("id")
      .maybeSingle();

    if (topicErr) {
      console.error("建立交易經典主題失敗:", topicErr.message);
      process.exit(1);
    }
    topicId = topic.id;
  }

  // 建立課程
  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      title: "交易經典",
      description: "豹叔帶你讀交易史。從 Livermore 到 Buffett，從 1929 到 2008，每一部都是完整的交易人物故事——他們的風格、他們的崛起、他們走過與沒走過的困境。每段≤3分鐘，豹叔中文字幕配音。\n\n免責聲明：本影片由 AI 加工製作（中譯配音），原始內容來自海外公開平台，僅供學習參考。版權歸原作者所有。",
      mode: "online",
      is_active: true,
      topic_id: topicId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("建立交易經典課程失敗:", error.message);
    process.exit(1);
  }
  return course.id;
}

async function main() {
  console.log("豹叔 · 交易經典 — 搜索歷史交易大師的人物故事...");
  const result = await searchVideos();
  const videos = result.videos ?? [];

  if (!videos.length) {
    console.log("未找到符合条件的视频");
    process.exit(0);
  }

  const supabase = await getSupabase();
  const courseId = await getOrCreateClassicsCourse(supabase);
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

  console.log("\n交易經典搜索与加工完成!");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
