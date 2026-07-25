#!/usr/bin/env node
/**
 * AI 内容加工线核心脚本
 *
 * 流程: 下载 → 脚提取(Whisper) → 中翻译(LLM) → 分段(≤3 min) → TTS → FFmpeg 合成 → R2 上
 *
 * 用法:
 *   node scripts/ai-pipeline/process-video.mjs --url "https://youtube.com/watch?v=xxx" --course-id <uuid>
 *   node scripts/ai-pipeline/process-video.mjs --url "https://youtube.com/watch?v=xxx" --course-id <uuid> --topic "AI 交易策略"
 *
 * 环境变量:
 *   OPENAI_API_KEY          - OpenAI API 密钥
 *   SUPABASE_URL            - Supabase 项目 URL
 *   SUPABASE_SERVICE_KEY    - Supabase service_role key
 *   VIDEO_STORAGE_PROVIDER  - "r2" 或 "aliyun" (默认 r2)
 *   VIDEO_STORAGE_BUCKET    - 存储桶名称
 *   VIDEO_STORAGE_ENDPOINT  - R2/S3 endpoint
 *   VIDEO_STORAGE_ACCESS_KEY_ID     - 访问密钥
 *   VIDEO_STORAGE_SECRET_ACCESS_KEY - 密钥
 *   VIDEO_STORAGE_PUBLIC_URL        - (可选) 公共访问 URL
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import OpenAI from "openai";

// --- Configuration ---

const MAX_SEGMENT_SECONDS = 180; // 3 minutes hard limit
const TTS_VOICE = "echo";        // deep calm male voice
const TTS_SPEED = 0.9;           // slightly slower, authoritative pace

const ROOT = resolve(import.meta.dirname, "../..");
const TMP = join(tmpdir(), `tl-pipeline-${randomUUID().slice(0, 8)}`);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Logging ---

function log(step, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${step}] ${msg}`);
}

function fail(step, msg) {
  log(step, `FAILED: ${msg}`);
  process.exit(1);
}

// --- Argument Parsing ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) opts.url = args[++i];
    else if (args[i] === "--course-id" && args[i + 1]) opts.courseId = args[++i];
    else if (args[i] === "--topic" && args[i + 1]) opts.topic = args[++i];
    else if (args[i] === "--source-platform" && args[i + 1]) opts.sourcePlatform = args[++i];
    else if (args[i] === "--content-kind" && args[i + 1]) opts.contentKind = args[++i];
  }
  if (!opts.url) fail("args", "缺少 --url");
  return opts;
}

function parseVideoId(url) {
  // youtube.com/watch?v=VIDEO_ID
  const m1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1) return { id: m1[1], platform: "youtube" };
  // youtu.be/VIDEO_ID
  const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2) return { id: m2[1], platform: "youtube" };
  // bilibili.com/video/BV...
  const m3 = url.match(/bilibili\.com\/video\/([a-zA-Z0-9]+)/);
  if (m3) return { id: m3[1], platform: "bilibili" };
  return { id: null, platform: "unknown" };
}

// --- Supabase ---

async function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    fail("supabase", "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  // Dynamic import (avoids Next.js module conflicts)
  const { createClient: _createClient } = await import("@supabase/supabase-js");
  return _createClient(supabaseUrl, supabaseKey);
}

async function insertPipelineJob(supabase, job) {
  const { data, error } = await supabase
    .from("ai_pipeline_jobs")
    .insert(job)
    .select("id")
    .maybeSingle();
  if (error) fail("db", `无法创建管線任务: ${error.message}`);
  return data.id;
}

async function updatePipelineJob(supabase, jobId, updates) {
  const { error } = await supabase
    .from("ai_pipeline_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) log("db", `警告: 更新任务状态失败: ${error.message}`);
}

async function insertCourseVideo(supabase, video) {
  const { data, error } = await supabase
    .from("course_videos")
    .insert(video)
    .select("id")
    .maybeSingle();
  if (error) fail("db", `无法创建视频记录: ${error.message}`);
  return data.id;
}

// --- R2 Upload ---

async function uploadToR2(key, filePath) {
  // Use the AWS SDK compatible upload (same as storage.ts)
  const bytes = readFileSync(filePath);
  const { uploadVideoObject } = await import("../../src/lib/video/storage.js");
  const result = await uploadVideoObject(key, bytes, "video/mp4");
  if (!result.ok) fail("upload", `R2 上传失败: ${result.error}`);
  return result;
}

// --- Step 1: Download ---

async function downloadVideo(url, videoId) {
  log("download", `开始下载: ${url}`);
  const outTemplate = join(TMP, "%(id)s.%(ext)s");

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("yt-dlp", [
      "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
      "--merge-output-format", "mp4",
      "-o", outTemplate,
      "--no-playlist",
      "--socket-timeout", "60",
      url,
    ], { stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-200)}`));
      else {
        const fp = join(TMP, `${videoId}.mp4`);
        if (!existsSync(fp)) reject(new Error(`下载完成但找不到文件: ${fp}`));
        else resolvePromise(fp);
      }
    });
    proc.on("error", reject);
  });
}

// --- Step 2: Transcribe (Whisper) ---

async function transcribeAudio(videoPath) {
  log("transcribe", "使用 Whisper 提取腳本...");
  const audioPath = join(TMP, "audio.mp3");

  // Extract audio to mp3
  await new Promise((resolvePromise, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", videoPath, "-vn", "-acodec", "libmp3lame",
      "-q:a", "4", "-y", audioPath,
    ], { stdio: "ignore", timeout: 120000 });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error("音频提取失败"));
      else resolvePromise();
    });
    proc.on("error", reject);
  });

  const audioFile = readFileSync(audioPath);
  // Create a proper File-like object for Whisper API
  const blob = new Blob([audioFile], { type: "audio/mp3" });
  const fileForApi = new File([blob], "audio.mp3", { type: "audio/mp3" });

  const transcription = await client.audio.transcriptions.create({
    model: "whisper-1",
    file: fileForApi,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  // Clean up audio file
  try { unlinkSync(audioPath); } catch {}

  return transcription;
}

// --- Step 3: Translate + Segment ---

async function translateAndSegment(transcription, topic, contentKind) {
  log("translate", "翻译并分段腳本...");

  const fullText = transcription.segments
    ?.map((s) => `[${s.start}s-${s.end}s] ${s.text}`)
    .join("\n") ?? transcription.text;

  const topicHint = topic ? `主题领域: ${topic}.` : "";

  // 豹叔 prompt: Charlie Munger style (交易经典)
  const uncleLeopardPrompt = `你是豹叔（Uncle Leopard），TradeLovin 平台上的交易經典導師。
原型：Charlie Munger — 睿智、講故事、跨學科思維、「反過來想，總是反過來想」。

翻譯任務：將以下英文交易影片腳本轉化為豹叔風格的中文敘述。

人物弧光要求（必須保留）：
1. 交易風格 + 真實案例 — 主角的標誌性交易、他具體做了什麼、什麼時候進出
2. 崛起之路 — 他從哪裡來、什麼轉捩點讓他走到這裡
3. 困境 — 他走過什麼低谷、有什麼坎他沒走過、他從中學到了什麼

語氣規則：
- 講故事 — 像長者在爐邊說一個交易傳奇，不急不慢
- 反過來想 — "反過來想，總是反過來想。什麼讓他失敗？"
- 跨學科 — 從物理、心理學、歷史中拉例子類比
- 簡潔有力 — 一句話說重點，不鋪墊
- 黑色幽默但溫和 — "市場就像一個情緒不穩定的朋友，你要學會在他恐慌時買單"
- 留白 — 說完就停，給人思考空間

硬規則（Humanizer-zh）：
- 刪掉「此外」「因此」「然而」「值得注意的是」「至關重要」
- 一句話不超過一個逗號
- 禁止「不僅……而且……」
- 禁止破折號（——）
- 禁止總結套話（「總之」「綜上所述」）

對比例子：
❌ "這是一個極其重要的投資原則，值得所有投資者深入思考"
✓ "蒙格說過：如果我知道我會死在哪裡，我就不去那個地方。Livermore 去了三次。"

每個片段不可超過 ${MAX_SEGMENT_SECONDS} 秒（約 200-250 個中文字）
按邏輯斷點分段（主題轉換、案例切換、結論段落）
每段必須有自己的完整小主題，不可中途硬切
使用交易領域的專業繁體術語

${topicHint}

返回 JSON 格式:
{
  "segments": [
    {
      "index": 1,
      "title": "Part 标题（10字内）",
      "text": "该段繁体中文译文",
      "original_start_sec": 0.0,
      "original_end_sec": 120.0,
      "estimated_duration_sec": 170
    }
  ]
}`;

  // 豹哥 prompt: Bobby Axelrod style (交易新銳)
  const brotherLeopardPrompt = `你是豹哥（Brother Leopard），TradeLovin 平台上的交易新銳教練。
原型：Bobby Axelrod — 銳利、自信、不解釋。

翻譯任務：將以下英文交易影片腳本轉化為豹哥風格的中文敘述。

人物弧光要求（必須保留）：
1. 交易風格 + 真實案例 — 主角的標誌性交易、他具體做了什麼、什麼時候進出
2. 崛起之路 — 他從哪裡來、什麼轉捩點
3. 困境 — 他走過什麼低谷、踩過什麼坑、有沒有走不過的坎

語氣規則：
- 銳利直接，不鋪墊 — 開頭就要讓人知道這傢伙為什麼值得注意
- 可以嘲諷 — "他覺得自己很聰明。市場不這麼想"
- 短句 — 一句話不過一個逗號
- 不亢奮 — 不加"極其""驚人""顛覆"
- 留白 — 說完重點就停

硬規則（Humanizer-zh）：
- 刪掉「此外」「因此」「然而」「值得注意的是」「至關重要」
- 一句話不超過一個逗號
- 禁止「不僅……而且……」
- 禁止破折號（——）
- 禁止總結套話（「總之」「綜上所述」）

對比例子：
❌ "這是一個極其重要的交易策略轉折點，值得所有交易者深入學習"
✓ "他就是在這裡翻身的。一筆交易，從破產邊緣回到牌桌"

每個片段不可超過 ${MAX_SEGMENT_SECONDS} 秒（約 200-250 個中文字）
按邏輯斷點分段（主題轉換、案例切換、結論段落）
每段必須有自己的完整小主題，不可中途硬切
使用交易領域的專業繁體術語

${topicHint}

返回 JSON 格式:
{
  "segments": [
    {
      "index": 1,
      "title": "Part 标题（10字内）",
      "text": "该段繁体中文译文",
      "original_start_sec": 0.0,
      "original_end_sec": 120.0,
      "estimated_duration_sec": 170
    }
  ]
}`;

  const systemPrompt = contentKind === "ai_classic"
    ? uncleLeopardPrompt   // 豹叔：交易經典
    : brotherLeopardPrompt; // 豹哥：交易新銳（預設）

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: fullText },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content);
  log("translate", `分成 ${result.segments.length} 段`);
  return result.segments;
}

// --- Step 4: Generate TTS ---

async function generateTTS(segments, voice = TTS_VOICE, speed = TTS_SPEED) {
  log("tts", `为 ${segments.length} 个片段生成中文语音...`);

  const audioFiles = [];
  for (const seg of segments) {
    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: seg.text,
      speed: speed,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const audioPath = join(TMP, `tts-${seg.index}.mp3`);
    writeFileSync(audioPath, buffer);
    audioFiles.push(audioPath);
    log("tts", `片段 ${seg.index} 语音生成完成`);
  }
  return audioFiles;
}

// --- Step 5: Compose with FFmpeg ---

async function composeVideo(videoPath, segment, audioFile, outputPath) {
  log("composite", `合成片段 ${segment.index}: ${segment.title}`);

  const startSec = segment.original_start_sec ?? 0;
  const duration = 3 + Math.min((segment.estimated_duration_sec ?? 170), 174) + 3; // 3s intro + content + 3s outro

  const subtitleFile = join(TMP, `sub-${segment.index}.srt`);

  // Generate simple SRT for the segment text
  const lines = splitSubtitles(segment.text, duration > 180 ? 174 : duration - 6);
  writeFileSync(subtitleFile, lines);

  const args = [
    "-ss", String(startSec),
    "-i", videoPath,
    "-i", audioFile,
    "-filter_complex",
    // Scale video, mute original, add TTS audio
    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v];` +
    `[v]subtitles=${subtitleFile.replace(/\\/g, "/")}:force_style='FontName=KaiTi,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=40'[vsub]`,
    "-map", "[vsub]",
    "-map", "1:a",
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-t", String(duration),
    "-shortest",
    "-y",
    outputPath,
  ];

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
    });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-200)}`));
      else resolvePromise();
    });
    proc.on("error", reject);
  });
}

function splitSubtitles(text, maxDuration) {
  // Simple SRT for the full segment text, split into 5-6 lines
  const chars = text.length;
  const lines = Math.ceil(chars / 30); // ~30 chars per subtitle line
  const durationPerLine = maxDuration / Math.max(lines, 1);

  let srt = "";
  let pos = 0;
  for (let i = 0; i < lines && pos < text.length; i++) {
    const end = Math.min(pos + 30, text.length);
    let chunk = text.slice(pos, end);
    // Don't break mid-word
    if (end < text.length && !/[，。！？、\s]/.test(text[end - 1])) {
      const lastBreak = Math.max(
        chunk.lastIndexOf("，"), chunk.lastIndexOf("。"),
        chunk.lastIndexOf("！"), chunk.lastIndexOf("？"),
        chunk.lastIndexOf(" ")
      );
      if (lastBreak > 15) {
        chunk = chunk.slice(0, lastBreak + 1);
        pos = pos + lastBreak + 1;
      } else {
        pos = end;
      }
    } else {
      pos = end;
    }

    const startSec = i * durationPerLine;
    const endSec = (i + 1) * durationPerLine;
    srt += `${i + 1}\n`;
    srt += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
    srt += `${chunk.trim()}\n\n`;
  }
  return srt;
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// --- Main Pipeline ---

async function main() {
  const opts = parseArgs();
  const { id: videoId, platform } = parseVideoId(opts.url);
  const sourcePlatform = opts.sourcePlatform || platform;
  const topic = opts.topic || null;

  log("start", `处理: ${opts.url} (${videoId ?? "unknown"})`);

  // Setup
  mkdirSync(TMP, { recursive: true });
  const supabase = await getSupabase();

  // Create pipeline job
  const jobId = await insertPipelineJob(supabase, {
    source_url: opts.url,
    source_platform: sourcePlatform,
    status: "downloading",
  });

  try {
    // Step 1: Download
    await updatePipelineJob(supabase, jobId, { status: "downloading" });
    const videoPath = await downloadVideo(opts.url, videoId);
    log("download", `下载完成: ${videoPath}`);

    // Step 2: Transcribe
    await updatePipelineJob(supabase, jobId, { status: "transcribing" });
    const transcription = await transcribeAudio(videoPath);
    log("transcribe", `腳本长度: ${transcription.text.length} 字`);
    const duration = transcription.duration ?? 0;
    log("transcribe", `原片时长: ${Math.round(duration)} 秒`);

    // Step 3: Translate + Segment
    await updatePipelineJob(supabase, jobId, { status: "translating" });
    const segments = await translateAndSegment(transcription, topic, opts.contentKind);
    await updatePipelineJob(supabase, jobId, { segment_count: segments.length });

    // Step 4: TTS
    await updatePipelineJob(supabase, jobId, { status: "generating_tts" });
    const audioFiles = await generateTTS(segments);

    // Step 5: Compose + Upload each segment
    const targetVideoIds = [];
    for (let i = 0; i < segments.length; i++) {
      await updatePipelineJob(supabase, jobId, { status: "compositing" });
      const seg = segments[i];
      const outPath = join(TMP, `segment-${seg.index}.mp4`);
      await composeVideo(videoPath, seg, audioFiles[i], outPath);

      await updatePipelineJob(supabase, jobId, { status: "uploading" });
      const storageKey = `videos/ai-pipeline/${randomUUID()}-${seg.index}.mp4`;
      await uploadToR2(storageKey, outPath);

      const seriesTitle = segments.length > 1
        ? `${seg.title} [${seg.index}/${segments.length}]`
        : seg.title;

      const videoId2 = await insertCourseVideo(supabase, {
        course_id: opts.courseId,
        title: seriesTitle,
        description: `AI 加工影片，原始来源: ${opts.url}`,
        duration: seg.estimated_duration_sec ?? 0,
        storage_key: storageKey,
        is_free_preview: false,
        source_url: opts.url,
        source_platform: sourcePlatform,
        is_ai_processed: true,
        has_ai_narration: true,
        original_language: "en",
        segment_index: segments.length > 1 ? seg.index : null,
        segment_total: segments.length > 1 ? segments.length : null,
      });
      targetVideoIds.push(videoId2);
      log("composite", `片段 ${seg.index}/${segments.length} 已上传, id=${videoId2}`);

      // Clean up segment files
      try { unlinkSync(outPath); unlinkSync(audioFiles[i]); } catch {}
    }

    // Mark complete
    await updatePipelineJob(supabase, jobId, {
      status: "completed",
      target_video_ids: targetVideoIds,
      completed_at: new Date().toISOString(),
    });

    log("done", `成功! ${segments.length} 个片段已发布`);
    log("done", `视频 IDs: ${targetVideoIds.join(", ")}`);
  } catch (err) {
    log("error", err.message);
    await updatePipelineJob(supabase, jobId, {
      status: "failed",
      error_log: err.message,
    });
    fail("error", err.message);
  }
}

main();
