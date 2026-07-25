#!/usr/bin/env node
/**
 * LEO-002｜豹系列影片上傳腳本
 *
 * 使用 S3 SDK 上傳影片到私有存儲，並在 Supabase course_videos 建記錄。
 * 支援完整版與 5 秒預覽版。
 *
 * 環境變數（沿用現有 S3 配置）:
 *   VIDEO_STORAGE_PROVIDER     (必填) r2 或 aliyun
 *   VIDEO_STORAGE_BUCKET       (必填)
 *   VIDEO_STORAGE_ENDPOINT     (必填)
 *   VIDEO_STORAGE_ACCESS_KEY_ID (必填)
 *   VIDEO_STORAGE_SECRET_ACCESS_KEY (必填)
 *   SUPABASE_SERVICE_ROLE_KEY  (必填)
 *   NEXT_PUBLIC_SUPABASE_URL   (必填)
 *
 * 用法:
 *   node scripts/test/leo-002/upload-video.mjs <mp4檔案路徑> [--course <course_id>] [--preview] [--title <標題>] [--duration <秒>] [--sort <序號>] [--published-at <ISO時間>]
 *
 * 範例:
 *   # 上傳豹哥完整版
 *   node scripts/test/leo-002/upload-video.mjs ./bro_bao_ep01.mp4 --title "EP01 趨勢追蹤入門" --duration 300 --sort 1
 *
 *   # 上傳豹哥 5 秒預覽
 *   node scripts/test/leo-002/upload-video.mjs ./bro_bao_ep01_preview.mp4 --title "EP01 趨勢追蹤入門（預覽）" --duration 5 --preview
 *
 *   # 設定未來發佈
 *   node scripts/test/leo-002/upload-video.mjs ./ep02.mp4 --title "EP02" --published-at "2026-07-01T00:00:00Z"
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";

// ── 預設 course ID ──────────────────────────────────────────────────

const COURSE_IDS = {
  bro_bao: "9ea59ef3-2f1f-4d61-be3f-29b7cc664084",   // 豹哥・交易新銳
  bro_shu: "78cc57c5-6b1c-462a-b8c6-ed5ceb5e14fb",   // 豹叔・交易經典
};

// ── 參數解析 ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log("LEO-002 影片上傳工具");
  console.log("");
  console.log("用法:");
  console.log("  node scripts/test/leo-002/upload-video.mjs <mp4檔案路徑> [選項]");
  console.log("");
  console.log("選項:");
  console.log("  --course <id>          Course ID (預設: 豹哥)");
  console.log("  --bao                  (快捷) 上傳到豹哥・交易新銳");
  console.log("  --shu                  (快捷) 上傳到豹叔・交易經典");
  console.log("  --title <標題>         影片標題");
  console.log("  --duration <秒>        影片時長（秒）");
  console.log("  --sort <序號>          排序序號");
  console.log("  --preview              設為免費預覽（5秒試看片）");
  console.log("  --published-at <ISO>   發佈時間（ISO 8601，不設=立即上架）");
  console.log("");
  console.log("環境變數（必設）:");
  console.log("  VIDEO_STORAGE_PROVIDER, VIDEO_STORAGE_BUCKET, VIDEO_STORAGE_ENDPOINT");
  console.log("  VIDEO_STORAGE_ACCESS_KEY_ID, VIDEO_STORAGE_SECRET_ACCESS_KEY");
  console.log("  SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL");
  process.exit(0);
}

const filePath = args[0];
let courseId = COURSE_IDS.bro_bao;
let title = basename(filePath).replace(/\.\w+$/, "");
let duration = null;
let sortOrder = 0;
let isPreview = false;
let publishedAt = null;

for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case "--course": courseId = args[++i]; break;
    case "--bao":   courseId = COURSE_IDS.bro_bao; break;
    case "--shu":   courseId = COURSE_IDS.bro_shu; break;
    case "--title": title = args[++i]; break;
    case "--duration": duration = Number(args[++i]) || null; break;
    case "--sort":  sortOrder = Number(args[++i]) || 0; break;
    case "--preview": isPreview = true; break;
    case "--published-at": publishedAt = args[++i] === "now" ? null : args[i]; break;
  }
}

// ── 檢查環境變數 ────────────────────────────────────────────────────

function env(name) { return (process.env[name] ?? "").trim(); }

function normalizeEndpoint(raw) {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function safeName(name) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
  return cleaned.slice(0, 120) || "video.mp4";
}

const PROVIDER = env("VIDEO_STORAGE_PROVIDER");
const BUCKET   = env("VIDEO_STORAGE_BUCKET");
const ENDPOINT = env("VIDEO_STORAGE_ENDPOINT");
const AK       = env("VIDEO_STORAGE_ACCESS_KEY_ID");
const SK       = env("VIDEO_STORAGE_SECRET_ACCESS_KEY");
const SB_URL   = env("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY   = env("SUPABASE_SERVICE_ROLE_KEY");

for (const [k, v] of Object.entries({PROVIDER, BUCKET, ENDPOINT, AK, SK, SB_URL, SB_KEY})) {
  if (!v) { console.error(`❌ 缺少環境變數: ${k}`); process.exit(1); }
}

// ── 讀取檔案 ────────────────────────────────────────────────────────

let fileBytes;
try {
  fileBytes = readFileSync(filePath);
} catch (err) {
  console.error(`❌ 無法讀取檔案: ${filePath}\n  ${err.message}`);
  process.exit(1);
}
const sizeMB = (fileBytes.length / (1024 * 1024)).toFixed(2);
console.log(`📄 ${filePath} (${sizeMB} MB)`);

// ── 上傳到 S3 ──────────────────────────────────────────────────────

const storageKey = `videos/${courseId}/${Date.now()}-${randomUUID()}-${safeName(basename(filePath))}`;

console.log(`📤 上傳到 S3: ${storageKey}`);

const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

const s3 = new S3Client({
  endpoint: normalizeEndpoint(ENDPOINT),
  region: "auto",
  forcePathStyle: true,
  credentials: { accessKeyId: AK, secretAccessKey: SK },
});

try {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: fileBytes,
    ContentType: "video/mp4",
  }));
} catch (err) {
  console.error(`❌ S3 上傳失敗: ${err.message}`);
  process.exit(1);
}
console.log("  ✅ 上傳成功");

// ── 寫入 course_videos ──────────────────────────────────────────────

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const insertData = {
  course_id: courseId,
  title,
  duration: duration ?? null,
  sort_order: sortOrder,
  storage_key: storageKey,
  is_free_preview: isPreview,
  published_at: publishedAt || null,
};

const { data, error } = await sb
  .from("course_videos")
  .insert(insertData)
  .select("id, course_id, title, sort_order, is_free_preview, published_at, created_at")
  .single();

if (error) {
  console.error(`❌ 寫入 course_videos 失敗: ${error.message}`);
  process.exit(1);
}

// ── 輸出結果 ────────────────────────────────────────────────────────

console.log("");
console.log("╔══════════════════════════════════════════════╗");
console.log("║  ✅ LEO-002 影片上傳完成                       ║");
console.log("╠══════════════════════════════════════════════╣");
console.log(`║  Video ID   : ${data.id}`);
console.log(`║  Course ID  : ${data.course_id}`);
console.log(`║  Title      : ${data.title}`);
console.log(`║  Sort Order : ${data.sort_order}`);
console.log(`║  Preview    : ${data.is_free_preview ? "是（5秒預覽）" : "否（完整版）"}`);
console.log(`║  Published  : ${data.published_at || "立即上架"}`);
console.log(`║  Storage Key: ${storageKey}`);
console.log("╚══════════════════════════════════════════════╝");
console.log("");
