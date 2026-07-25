#!/usr/bin/env node
/**
 * 小文章生成本 — AI Agent  取本周 AI 炒股点并撰写繁体中文文章
 *
 * 用法:
 *   node scripts/ai-pipeline/generate-redbook-article.mjs
 *
 * 环境变量:
 *   OPENAI_API_KEY
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY
 */

async function generateArticle() {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `你是 TradeLovin 的 AI 交易教练「豹哥」。请撰写一篇小文章。

要求:
1. 繁体中文，800-1000 字
2. 主题：本周 AI 炒股领域的最新消息/工具/趋势
3. 不要 AI 生成痕迹 —— 用自然的口语，像资深交易员在朋友聚会上说话
4. 标题要触发 FOMO 但不标题党（例：「上周用来跑赢大市的 AI 策略，现在你还来得及看」）
5. 结构：标题 → 核心观点（2-3 句）→ 2-3 具体案例/数据 → 总结 + CTA（「来 TradeLovin 看更多」）
6. 文末加一句：「想了解更多 AI 交易？来 TradeLovin，豹哥给你看你在国内看不到的」`,
      },
    ],
    temperature: 0.8,
  });

  return {
    title: extractTitle(response.choices[0].message.content),
    content: response.choices[0].message.content,
  };
}

function extractTitle(text) {
  const lines = text.trim().split("\n");
  const first = lines[0].replace(/^#+\s*/, "").trim();
  if (first.length > 5 && first.length < 60) return first;
  return "AI 炒股本周报";
}

async function saveToDb(title, content) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，跳过存储");
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase.from("ai_redbook_articles").insert({
    title,
    content,
    status: "draft",
  });

  if (error) console.error("存储文章失败:", error.message);
  else console.log("文章已存入草稿箱");
}

async function main() {
  console.log("生成小文章...");
  const { title, content } = await generateArticle();

  console.log(`标题: ${title}`);
  console.log(`字数: ${content.length}`);
  console.log("\n--- 文章预览 ---\n");
  console.log(content);
  console.log("\n--- 预览结束 ---\n");

  await saveToDb(title, content);
  console.log("完成! 管理员可在后台审核后发布。");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
