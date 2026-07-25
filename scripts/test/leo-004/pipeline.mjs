#!/usr/bin/env node
/**
 * LEO-004｜數字人講課自動化管線
 *
 * 流程:
 *   1. 讀取腳本 JSON → 按自然停頓切 12-15s 段落
 *   2. 豆包 TTS 為每段生成音頻（可並行） → 上傳至 Supabase 公開 bucket
 *   3. OmniHuman 1.5 串列生成口型片段（免費額度 1 併發）
 *   4. ffmpeg concat 拼接所有片段 + 片尾出處字卡
 *   5. 整體燒錄中英雙語字幕
 *   6. 上傳成品至 Supabase 私有 bucket → INSERT course_videos (status: draft)
 *   7. 不自動發佈，等人工點發佈
 *
 * 使用方式:
 *   $env:VOLC_ACCESS_KEY='你的AK'
 *   $env:VOLC_SECRET_KEY='你的SK'
 *   $env:DOUBAO_TTS_ACCESS_TOKEN='你的TTS API Key'
 *   $env:NEXT_PUBLIC_SUPABASE_URL='你的Supabase URL'
 *   $env:SUPABASE_SERVICE_ROLE_KEY='你的Service Role Key'
 *   node scripts/test/leo-004/pipeline.mjs --script=path/to/script.json
 *
 * 參數:
 *   --script      腳本 JSON 路徑（必填，見下方格式）
 *   --segment-max 每段最長秒數（預設 15）
 *   --chars-per-s 中文字速 ≈ 時長估算係數（預設 3.2）
 *   --dry-run     僅分割腳本不實際生成（檢查分段結果用）
 *
 * 腳本 JSON 格式:
 *   {
 *     "title": "影片標題",
 *     "character": "bro_bao",
 *     "course_id": "00000000-0000-0000-0000-000000000000",
 *     "description": "影片簡介（可選）",
 *     "narration": "全文旁白（不分段，管線會自動按標點斷句）",
 *     "credits": "出處：xx 課程 © 2026 TradeLovin",
 *     "subtitles": [
 *       { "zh": "這不是運氣差", "en": "This was not bad luck." },
 *       { "zh": "是一場教科書級的事故", "en": "It was a textbook-level accident." }
 *     ]
 *   }
 *
 * 角色配置:
 *   bro_bao: 豹哥（年輕交易新銳），聲線 zh_male_taocheng_uranus_bigtts
 *   bro_shu: 豹叔（沉穩經典），聲線 zh_male_qingrun_moon_bigtts
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { execSync, exec } from "node:child_process";

// ── 預設值 ──────────────────────────────────────────────────────────

const DEFAULTS = {
  // OmniHuman
  region: "cn-north-1",
  service: "cv",
  action: "CVSubmitTask",
  queryAction: "CVGetResult",
  version: "2022-08-31",
  omniEndpoint: "https://visual.volcengineapi.com",
  reqKey: "jimeng_realman_avatar_picture_omni_v15",
  prompt: "", // 可選提示詞（若需指定氛圍/語調可覆蓋）

  // TTS
  ttsEndpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  ttsResourceId: "seed-tts-2.0",

  // 分段
  segmentMaxSec: 15,
  charsPerSec: 3.2,

  // 輪詢
  pollIntervalMs: 15_000,
  maxWaitMsPerSegment: 600_000,

  // ffmpeg
  outputDir: join(process.cwd(), "scripts", "test", "leo-004", "output"),
};

// ── 角色配置 ────────────────────────────────────────────────────────

const CHARACTERS = {
  bro_bao: {
    name: "豹哥",
    imageUrl:
      "https://bpuqqyqmrtchaqfouygm.supabase.co/storage/v1/object/public/assets/bro_bao_master_v2.png",
    speakerId: "zh_male_liufei_uranus_bigtts",
    prompt: "交易員對著鏡頭講課，語氣自信專業。背景是現代交易室，冷色調燈光。",
    // 豆包 TTS 教官口吻指令（context_texts 自然語言提示詞）
    ttsContext: "用簡潔、權威、不容置疑的語氣講課，像交易大廳裡的老大訓話。乾脆俐落，短句斷開，不要拖泥帶水。",
    // 語速：15 ≈ 1.15x，中快速、有節奏感
    ttsSpeechRate: 15,
  },
  bro_shu: {
    name: "豹叔",
    imageUrl:
      "https://bpuqqyqmrtchaqfouygm.supabase.co/storage/v1/object/public/assets/bro_bao_master.png", // 待更新
    speakerId: "zh_male_qingrun_moon_bigtts",
    prompt: "資深交易員沉穩講課，語調溫和有力。背景是古典書房，暖色調燈光。",
  },
};

// ── CLI 參數解析 ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { script: null, segmentMax: DEFAULTS.segmentMaxSec, charsPerSec: DEFAULTS.charsPerSec, dryRun: false, noTranslate: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // 支援 --key=value 和 --key value 兩種格式
    if (a.startsWith("--script=")) opts.script = a.slice("--script=".length);
    else if (a === "--script" || a === "-s") opts.script = args[++i];
    else if (a.startsWith("--segment-max=")) opts.segmentMax = Number(a.slice("--segment-max=".length));
    else if (a === "--segment-max") opts.segmentMax = Number(args[++i]);
    else if (a.startsWith("--chars-per-s=")) opts.charsPerSec = Number(a.slice("--chars-per-s=".length));
    else if (a === "--chars-per-s") opts.charsPerSec = Number(args[++i]);
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--no-translate") opts.noTranslate = true;
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log("LEO-004｜數字人講課自動化管線");
      console.log("");
      console.log("  node scripts/test/leo-004/pipeline.mjs --script=script.json");
      console.log("");
      console.log("參數:");
      console.log("  --script       腳本 JSON 路徑（必填）");
      console.log("  --segment-max  每段最長秒數（預設 15）");
      console.log("  --chars-per-s  中文字速 ≈ 時長估算（預設 3.2）");
      console.log("  --dry-run      僅分割腳本不實際生成");
      console.log("  --no-translate 跳過 LLM 翻譯（仍做簡繁轉換）");
      console.log("");
      console.log("環境變數（必填）:");
      console.log("  VOLC_ACCESS_KEY, VOLC_SECRET_KEY");
      console.log("  DOUBAO_TTS_ACCESS_TOKEN");
      console.log("  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
      process.exit(0);
    }
  }
  if (!opts.script) {
    console.error("❌ 缺少 --script 參數");
    console.error("   用法: node scripts/test/leo-004/pipeline.mjs --script=script.json");
    process.exit(1);
  }
  return opts;
}

// ── 工具函數 ────────────────────────────────────────────────────────

function env(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatElapsed(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── 分段引擎 ────────────────────────────────────────────────────────

/**
 * 按自然停頓將旁白切成 12-15 秒的段落
 *
 * 規則:
 *  1. 先按 。！？\n 斷句（高優先級停頓）
 *  2. 若單句超過 segmentMaxSec 估算，再按 ，、：； 斷（次優先級）
 *  3. 貪心合併：只要累積長度 ≤ segmentMaxSec * charsPerSec 就一直加
 *  4. 每段以完整句尾結束（不硬切句子中間）
 */
function segmentText(text, maxSec, charsPerSec) {
  const maxChars = Math.floor(maxSec * charsPerSec);

  // Step 1: 按高優先級標點斷句
  const highPause = text.split(/(?<=[。！？\n])/g).map((s) => s.trim()).filter(Boolean);

  // Step 2: 對每個高優先級句子，若仍太長，按次優先級再切
  const sentences = [];
  for (const s of highPause) {
    if (s.length <= maxChars) {
      sentences.push(s);
    } else {
      // 次優先級標點：逗號、冒號、分號
      const subParts = s.split(/(?<=[，、：；])/g).map((p) => p.trim()).filter(Boolean);
      for (const p of subParts) {
        if (p.length <= maxChars) {
          sentences.push(p);
        } else {
          // 連次優先級斷句後仍太長 → 按長度強制切（保留語意）
          for (let i = 0; i < p.length; i += maxChars) {
            sentences.push(p.slice(i, i + maxChars));
          }
        }
      }
    }
  }

  // Step 3: 貪心合併 → 每段盡量接近 maxChars 但不過
  const segments = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length <= maxChars) {
      current += s;
    } else {
      if (current) segments.push(current);
      current = s;
    }
  }
  if (current) segments.push(current);

  // 估算每段秒數
  return segments.map((text, i) => ({
    index: i,
    text,
    charCount: text.length,
    estSec: text.length / charsPerSec,
  }));
}

// ── TTS 模組（可並行）────────────────────────────────────────────

/**
 * 調用豆包 TTS API 生成單段音頻，合併流式 JSON chunk → Buffer
 */
async function ttsOneSegment(text, speakerId, accessToken, resourceId, options = {}) {
  const { speechRate, contextText } = options;
  const body = {
    user: { uid: `leo-004-${randomUUID().slice(0, 8)}` },
    req_params: {
      text,
      speaker: speakerId,
      audio_params: {
        format: "mp3",
        sample_rate: 24000,
        ...(speechRate != null ? { speech_rate: speechRate } : {}),
      },
      ...(contextText ? {
        additions: JSON.stringify({
          context_texts: [contextText],
          disable_emoji_filter: true,
        }),
      } : {}),
    },
  };

  const resp = await fetch(DEFAULTS.ttsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": accessToken,
      "X-Api-Resource-Id": resourceId,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`TTS HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  // 流式 JSON chunk 拼接
  const raw = await resp.text();
  const chunks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        const obj = JSON.parse(raw.slice(start, i + 1));
        if (obj.code === 0 && obj.data) chunks.push(obj.data);
      }
    }
  }
  if (chunks.length === 0) throw new Error("TTS 回應中無音頻數據");
  return Buffer.from(chunks.join(""), "base64");
}

/**
 * 為所有段落生成音頻（並行），上傳至 Supabase 公開 bucket
 */
async function generateAllAudio(segments, speakerId, ttsToken, ttsResourceId, ttsOptions = {}) {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 1: 豆包 TTS 生成旁白音頻（並行）         ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  段落數: ${segments.length}`);
  console.log(`  音色: ${speakerId}`);
  if (ttsOptions.contextText) console.log(`  語氣: ${ttsOptions.contextText}`);
  if (ttsOptions.speechRate != null) console.log(`  語速: ${ttsOptions.speechRate}`);
  console.log("");

  const results = await Promise.all(
    segments.map(async (seg) => {
      console.log(`  [${seg.index + 1}/${segments.length}] TTS 生成中… (${seg.charCount} 字, ~${seg.estSec.toFixed(1)}s)`);
      const buf = await ttsOneSegment(seg.text, speakerId, ttsToken, ttsResourceId, ttsOptions);
      const url = await uploadToSupabase(buf, `tts/leo-004-seg-${seg.index}-${Date.now()}.mp3`, "audio/mpeg");
      console.log(`  [${seg.index + 1}/${segments.length}] ✅ ${(buf.length / 1024).toFixed(1)} KB → ${url}`);
      return { ...seg, audioBuffer: buf, audioUrl: url };
    })
  );

  console.log("");
  return results;
}

// ── Supabase 工具 ────────────────────────────────────────────────────

let _sbClient = null;
async function getSupabase() {
  if (_sbClient) return _sbClient;
  const { createClient } = await import("@supabase/supabase-js");
  _sbClient = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _sbClient;
}

async function uploadToSupabase(buffer, path, contentType) {
  const sb = await getSupabase();
  const { error } = await sb.storage.from("assets").upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Supabase 上傳失敗: ${error.message}`);
  const { data } = sb.storage.from("assets").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadFinalVideo(buffer, storageKey) {
  const sb = await getSupabase();
  const { error } = await sb.storage.from("Videos").upload(storageKey, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`最終視頻上傳失敗: ${error.message}`);
}

// ── OmniHuman 模組（串列，1 併發）─────────────────────────────────

let _SignerClass = null;
async function getSigner() {
  if (_SignerClass) return _SignerClass;
  const mod = await import("@volcengine/openapi");
  _SignerClass = mod.Signer;
  return _SignerClass;
}

async function submitOmniHumanTask(imageUrl, audioUrl, prompt, ak, sk) {
  const Signer = await getSigner();
  const payload = {
    req_key: DEFAULTS.reqKey,
    image_url: imageUrl,
    audio_url: audioUrl,
    prompt: prompt || "",
    seed: -1,
    pe_fast_mode: false,
  };

  const requestData = {
    region: DEFAULTS.region,
    method: "POST",
    params: { Action: DEFAULTS.action, Version: DEFAULTS.version },
    headers: {
      Region: DEFAULTS.region,
      Service: DEFAULTS.service,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  const signer = new Signer(requestData, DEFAULTS.service);
  signer.addAuthorization({ accessKeyId: ak, secretKey: sk });

  const submitUrl = `${DEFAULTS.omniEndpoint}?Action=${DEFAULTS.action}&Version=${DEFAULTS.version}`;
  const resp = await fetch(submitUrl, {
    method: "POST",
    headers: requestData.headers,
    body: requestData.body,
  });

  const rawText = await resp.text();
  let json;
  try { json = JSON.parse(rawText); } catch {
    throw new Error(`OmniHuman 提交回非 JSON (HTTP ${resp.status}): ${rawText.slice(0, 400)}`);
  }
  if (json.code !== 10000) {
    throw new Error(`OmniHuman 提交失敗: code=${json.code} message=${json.message}`);
  }
  return json.data.task_id;
}

async function pollOmniHumanTask(taskId, ak, sk) {
  const Signer = await getSigner();
  const startTime = Date.now();
  let count = 0;

  while (Date.now() - startTime < DEFAULTS.maxWaitMsPerSegment) {
    count++;
    await sleep(DEFAULTS.pollIntervalMs);

    const requestData = {
      region: DEFAULTS.region,
      method: "POST",
      params: { Action: DEFAULTS.queryAction, Version: DEFAULTS.version },
      headers: {
        Region: DEFAULTS.region,
        Service: DEFAULTS.service,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ req_key: DEFAULTS.reqKey, task_id: taskId }),
    };

    const signer = new Signer(requestData, DEFAULTS.service);
    signer.addAuthorization({ accessKeyId: ak, secretKey: sk });

    const queryUrl = `${DEFAULTS.omniEndpoint}?Action=${DEFAULTS.queryAction}&Version=${DEFAULTS.version}`;
    const resp = await fetch(queryUrl, {
      method: "POST",
      headers: requestData.headers,
      body: requestData.body,
    });

    const rawText = await resp.text();
    let json;
    try { json = JSON.parse(rawText); } catch {
      console.error(`  ⚠ OmniHuman 查詢回非 JSON (HTTP ${resp.status}): ${rawText.slice(0, 200)}`);
      await sleep(5000);
      continue;
    }
    if (json.code !== 10000) continue; // retry on transient errors

    const status = (json.data?.status ?? "").toLowerCase();
    if (status === "done") return json.data.video_url;
    if (status === "failed" || status === "error") throw new Error(`OmniHuman 任務失敗: ${JSON.stringify(json.data)}`);
  }
  throw new Error(`OmniHuman 任務 ${taskId} 超時`);
}

async function downloadVideo(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下載失敗: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * 串列為所有段落生成 OmniHuman 視頻（1 併發）
 */
async function generateAllVideos(segments, imageUrl, prompt, ak, sk, outputDir) {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 2: OmniHuman 生成口型片段（串列）      ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  片段數: ${segments.length}`);
  console.log(`  併發: 1（免費額度限制）`);
  console.log("");

  const results = [];
  for (const seg of segments) {
    const startTime = Date.now();

    // 提交任務（最多重試 3 次，每次等 10 秒）
    let taskId;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`  [${seg.index + 1}/${segments.length}] 提交 OmniHuman 任務…${attempt > 1 ? ` (重試 ${attempt}/3)` : ""}`);
        taskId = await submitOmniHumanTask(imageUrl, seg.audioUrl, prompt, ak, sk);
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 3) {
          console.error(`  ⚠ 提交失敗: ${err.message}，10 秒後重試…`);
          await sleep(10_000);
        } else {
          throw new Error(`OmniHuman 提交 3 次均失敗: ${lastErr.message}`);
        }
      }
    }
    console.log(`  [${seg.index + 1}/${segments.length}] 任務: ${taskId}, 輪詢中…`);

    const videoUrl = await pollOmniHumanTask(taskId, ak, sk);
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`  [${seg.index + 1}/${segments.length}] 生成完成 (${formatElapsed(elapsed)})`);

    const buf = await downloadVideo(videoUrl);
    const filename = `seg-${String(seg.index).padStart(3, "0")}.mp4`;
    const localPath = join(outputDir, filename);
    writeFileSync(localPath, buf);
    results.push({ ...seg, videoPath: localPath, videoBuffer: buf });
    console.log(`  [${seg.index + 1}/${segments.length}] ✅ ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${filename}`);
    console.log("");
  }

  return results;
}

// ── ffmpeg 拼接模組 ────────────────────────────────────────────────

/**
 * 用 ffprobe 獲取每個片段的準確時長
 */
function getVideoDuration(filePath) {
  const raw = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: "utf8" }
  ).trim();
  return parseFloat(raw);
}

/**
 * ffmpeg concat 拼接所有片段
 */
function concatSegments(videoPaths, outputPath) {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 3: ffmpeg concat 拼接片段              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  片段數: ${videoPaths.length}`);

  // 生成 ffmpeg concat 文件清單
  const listPath = join(DEFAULTS.outputDir, "concat-list.txt");
  const listContent = videoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, listContent);

  execSync(
    `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -y "${outputPath}"`,
    { stdio: "inherit" }
  );

  const finalSize = (execSync(`powershell -c "(Get-Item '${outputPath}').length"`, { encoding: "utf8" }).trim());
  console.log(`  ✅ 拼接完成`);
  console.log("");
  return outputPath;
}

// ── 字幕 + 片尾模組 ────────────────────────────────────────────────

/**
 * 繁→簡對照表（常用字）
 */
const TRAD_TO_SIMP = {
  "這": "这", "個": "个", "場": "场", "級": "级", "事": "事", "故": "故",
  "來": "来", "歷": "历", "史": "史", "銀": "银", "行": "行", "該": "该",
  "買": "买", "賣": "卖", "賺": "赚", "價": "价", "卻": "却", "賭": "赌",
  "虧": "亏", "損": "损", "藏": "藏", "帳": "账", "戶": "户", "輸": "输",
  "倉": "仓", "億": "亿", "萬": "万", "兩": "两", "課": "课", "訴": "诉",
  "風": "风", "控": "控", "門": "门", "開": "开", "關": "关", "發": "发",
  "頭": "头", "對": "对", "鏡": "镜", "講": "讲", "氣": "气", "專": "专",
  "業": "业", "現": "现", "燈": "灯", "為": "为", "體": "体", "讓": "让",
  "參": "参", "經": "经", "調": "调", "選": "选", "標": "标", "時": "时",
  "間": "间", "書": "书", "畫": "画", "網": "网", "點": "点", "數": "数",
  "據": "据", "會": "会", "動": "动", "種": "种", "學": "学", "號": "号",
  "臺": "台", "灣": "湾", "國": "国", "際": "际", "獨": "独", "險": "险",
};

function toSimplified(text) {
  let result = "";
  for (const ch of text) {
    result += TRAD_TO_SIMP[ch] || ch;
  }
  return result;
}

/**
 * 用 DeepSeek 將中文字幕翻譯成英文
 * 輸入: [{zh:"原文1"}, {zh:"原文2"}, ...]
 * 輸出: [{zh:"原文1(簡體)","en":"译文1"}, ...]
 */
async function translateSubtitles(zhSubtitles) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.log("  ⚠ 未設定 DEEPSEEK_API_KEY，跳過英文翻譯");
    return zhSubtitles.map(s => ({ zh: toSimplified(s.zh), en: "" }));
  }

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 0.5: LLM 翻譯中文字幕 → 中英雙語       ║");
  console.log("╚══════════════════════════════════════════════╝");

  const zhList = zhSubtitles.map(s => s.zh);
  const prompt = `你是一個專業財經翻譯。將以下中文逐句翻譯成英文。術語對照：尼克·李森=Nick Leeson, 霸菱銀行=Barings Bank, 套利=arbitrage, 風控=risk control, 交易=trader/trading, 加倉=double down/add to position
輸出純 JSON 陣列，每個元素為 {"zh":"原文","en":"譯文"}，不要任何其他文字：
${JSON.stringify(zhList)}`;

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    const resp = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });
    const raw = resp.choices[0].message.content.trim();
    // 清理可能的 markdown code block 包裝
    const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const translated = JSON.parse(jsonStr);

    // 確保每個元素都有 zh/en，zh 轉簡體
    const result = translated.map((item, i) => ({
      zh: toSimplified(item.zh || zhSubtitles[i]?.zh || ""),
      en: item.en || "",
    }));
    console.log(`  ✅ 翻譯完成: ${result.length} 條字幕`);
    return result;
  } catch (err) {
    console.error(`  ⚠ 翻譯失敗: ${err.message}，僅使用中文簡體字幕`);
    return zhSubtitles.map(s => ({ zh: toSimplified(s.zh), en: "" }));
  }
}

function toAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2);
  return `${h}:${String(m).padStart(2, "0")}:${s.padStart(5, "0")}`;
}

/**
 * Netflix 風格可調參數（修改這兩個值即可全局調整字號）
 */
const SUBTITLE_ZH_SIZE = 56;  // 中文字號（Netflix 約 56-60）
const SUBTITLE_EN_SIZE = 38;  // 英文字號（約中文的 2/3）

/**
 * 生成 Netflix 風格 ASS 字幕：粗體、底部居中、半透明黑底、中文上英文下
 */
function generateAss(subtitles, segmentDurations, totalDuration) {
  const segEndTimes = [];
  let cum = 0;
  for (const d of segmentDurations) {
    cum += d;
    segEndTimes.push(cum);
  }

  // 中文字幕色：純白 &H00FFFFFF，英文：淡黃 &H00FFF0B0
  // 半透明黑底 &H80000000，粗體 -1，底部居中 Alignment=2
  // MarginV 改為 120 讓字幕拉到畫面下半區但不過底
  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 1440
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ZH,Microsoft YaHei,${SUBTITLE_ZH_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,80,80,120,1
Style: EN,Microsoft YaHei,${SUBTITLE_EN_SIZE},&H00FFF0B0,&H00FFF0B0,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,2,2,80,80,85,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const subPerSeg = Math.ceil(subtitles.length / segmentDurations.length);
  let subIdx = 0;
  let timeStart = 0;

  for (let segIdx = 0; segIdx < segmentDurations.length && subIdx < subtitles.length; segIdx++) {
    const segEnd = segEndTimes[segIdx];
    const segDur = segmentDurations[segIdx];
    const subsInSeg = Math.min(subPerSeg, subtitles.length - subIdx);
    const subDur = segDur / subsInSeg;

    for (let i = 0; i < subsInSeg && subIdx < subtitles.length; i++, subIdx++) {
      const s = timeStart + i * subDur;
      const e = Math.min(s + subDur, segEnd);
      const sub = subtitles[subIdx];
      // 中文在上層 (Layer 0)，英文在下層 (Layer 1) — 但實際上 ASS 用不同 Style + MarginV 控制上下
      ass += `Dialogue: 0,${toAssTime(s)},${toAssTime(e)},ZH,,0,0,0,,${sub.zh}\\N{\\fnMicrosoft YaHei\\fs${SUBTITLE_EN_SIZE}\\c&HFFF0B0&\\3c&H000000&\\bord2.5}${sub.en}\n`;
    }
    timeStart = segEnd;
  }

  return ass;
}

/**
 * 生成片尾出處字卡（5 秒黑底白色文字）
 */
function generateCreditsCard(creditsText, outputPath) {
  const escaped = creditsText.replace(/['\\:,]/g, "\\$&");
  execSync(
    `ffmpeg -f lavfi -i "color=c=black:s=1440x1440:d=5:r=25" ` +
    `-vf "drawtext=fontfile=/Windows/Fonts/msyh.ttc:text='${escaped}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" ` +
    `-c:v libx264 -crf 23 -an -y "${outputPath}"`,
    { stdio: "inherit" }
  );
  return outputPath;
}

/**
 * 燒錄字幕到視頻
 */
function burnSubtitles(videoPath, assPath, outputPath) {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 4: 燒錄中英雙語字幕                    ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Windows 路徑中的 \ 和 : 會破壞 ffmpeg ASS 濾鏡解析，轉成正斜杠 + filename= 子選項
  const assSafe = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  execSync(
    `ffmpeg -i "${videoPath.replace(/\\/g, "/")}" -vf "ass=filename='${assSafe}'" -c:v libx264 -crf 23 -preset fast -c:a copy -y "${outputPath.replace(/\\/g, "/")}"`,
    { stdio: "inherit" }
  );
  console.log(`  ✅ 字幕燒錄完成`);
  console.log("");
  return outputPath;
}

// ── DB 上架模組 ────────────────────────────────────────────────────

async function insertCourseVideo({
  courseId, title, description, duration,
  storageKey, sortOrder, isAiProcessed, hasAiNarration,
  sourceUrl, originalLanguage,
}) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("course_videos")
    .insert({
      course_id: courseId,
      title,
      description: description || null,
      duration: Math.round(duration),
      storage_key: storageKey,
      sort_order: sortOrder || 0,
      is_free_preview: false,
      is_ai_processed: isAiProcessed ?? true,
      has_ai_narration: hasAiNarration ?? true,
      source_url: sourceUrl || null,
      source_platform: "omnihuman",
      original_language: originalLanguage || "zh-TW",
    })
    .select("id")
    .single();

  if (error) throw new Error(`DB INSERT 失敗: ${error.message}`);
  console.log(`  ✅ course_videos 記錄已建立: ${data.id}`);
  return data.id;
}

// ── 主流程 ──────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // 讀取腳本
  const scriptRaw = readFileSync(opts.script, "utf8");
  const script = JSON.parse(scriptRaw);

  const { title, character, course_id, description, narration, credits, subtitles } = script;
  if (!title || !character || !course_id || !narration) {
    console.error("❌ 腳本 JSON 缺少必填欄位: title, character, course_id, narration");
    process.exit(1);
  }

  const charConfig = CHARACTERS[character];
  if (!charConfig) {
    console.error(`❌ 未知角色: ${character}。有效值: ${Object.keys(CHARACTERS).join(", ")}`);
    process.exit(1);
  }

  // 環境變數檢查（放在 Step 0 和 dry-run 之後，因為 dry-run 不需要環境變數）
  const AK = env("VOLC_ACCESS_KEY");
  const SK = env("VOLC_SECRET_KEY");
  const TTS_TOKEN = env("DOUBAO_TTS_ACCESS_TOKEN");
  const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

  mkdirSync(DEFAULTS.outputDir, { recursive: true });

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  LEO-004  數字人講課自動化管線                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  標題: ${title}`);
  console.log(`  角色: ${charConfig.name}`);
  console.log(`  課程: ${course_id}`);
  console.log("");

  // ── Step 0: 分割腳本 ──
  console.log("╔══════════════════════════════════════════════╗");
  console.log(`║  Step 0: 分割腳本（每段 ≤ ${opts.segmentMax}s） ║`);
  console.log("╚══════════════════════════════════════════════╝");
  const segments = segmentText(narration, opts.segmentMax, opts.charsPerSec);
  const totalEstSec = segments.reduce((s, seg) => s + seg.estSec, 0);
  console.log(`  段落數: ${segments.length}`);
  console.log(`  總估算時長: ${totalEstSec.toFixed(1)} 秒 (${(totalEstSec / 60).toFixed(1)} 分鐘)`);
  console.log("");
  segments.forEach((seg) => {
    console.log(`  [${seg.index}] ~${seg.estSec.toFixed(1)}s | ${seg.charCount} 字 | "${seg.text.slice(0, 40)}${seg.text.length > 40 ? "…" : ""}"`);
  });
  console.log("");

  if (opts.dryRun) {
    console.log("✅ 乾運行完成（--dry-run 僅檢查分段結果）");
    console.log("");
    console.log("━━━ 估算 ━━━");
    console.log(`  段落數: ${segments.length}`);
    console.log(`  OmniHuman 生成耗時: ~${(segments.length * 7).toFixed(0)}–${(segments.length * 12).toFixed(0)} 分鐘`);
    console.log(`  預估費用: ¥${(totalEstSec * 0.2).toFixed(2)}（從免費額度內扣除）`);
    console.log("");
    process.exit(0);
  }

  if (!AK || !SK || !TTS_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ 缺少必要環境變數:");
    if (!AK) console.error("   VOLC_ACCESS_KEY");
    if (!SK) console.error("   VOLC_SECRET_KEY");
    if (!TTS_TOKEN) console.error("   DOUBAO_TTS_ACCESS_TOKEN");
    if (!SUPABASE_URL) console.error("   NEXT_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_KEY) console.error("   SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // ── Step 0.5: 翻譯字幕（中文→簡體中文+英文）──
  let finalSubtitles = subtitles || [];
  if (finalSubtitles.length > 0 && !opts.noTranslate) {
    finalSubtitles = await translateSubtitles(finalSubtitles);
  } else if (finalSubtitles.length > 0) {
    // --no-translate：僅做簡繁轉換
    finalSubtitles = finalSubtitles.map(s => ({ zh: toSimplified(s.zh), en: s.en || "" }));
  }

  // ── Step 1: TTS（並行）──
  const ttsOptions = {
    speechRate: charConfig.ttsSpeechRate,
    contextText: charConfig.ttsContext,
  };
  const segmentsWithAudio = await generateAllAudio(
    segments, charConfig.speakerId, TTS_TOKEN, DEFAULTS.ttsResourceId, ttsOptions
  );

  // ── Step 2: OmniHuman 生成（串列）──
  const segmentsWithVideo = await generateAllVideos(
    segmentsWithAudio, charConfig.imageUrl, charConfig.prompt,
    AK, SK, DEFAULTS.outputDir
  );

  // ── Step 3: 獲取片段實際時長 ──
  const segmentDurations = segmentsWithVideo.map((seg) => getVideoDuration(seg.videoPath));
  const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);
  console.log(`  總時長: ${totalDuration.toFixed(1)} 秒 (${(totalDuration / 60).toFixed(1)} 分鐘)`);

  // ── Step 4: 拼接片段 ──
  const videoPaths = segmentsWithVideo.map((seg) => seg.videoPath);
  const concatPath = join(DEFAULTS.outputDir, `concat-${ts()}.mp4`);
  concatSegments(videoPaths, concatPath);

  // ── Step 5: 生成片尾字卡 ──
  const creditsText = credits || "";
  const creditsPath = join(DEFAULTS.outputDir, `credits-${ts()}.mp4`);
  if (creditsText) {
    generateCreditsCard(creditsText, creditsPath);
  }

  // ── Step 6: 拼接 + 片尾 → 完整視頻 ──
  const allVideoPaths = creditsText ? [...videoPaths, creditsPath] : videoPaths;
  const fullConcatPath = join(DEFAULTS.outputDir, `full-${ts()}.mp4`);
  concatSegments(allVideoPaths, fullConcatPath);

  // ── Step 7: 生成 ASS 字幕 ──
  let assPath = null;
  if (finalSubtitles.length > 0) {
    const assContent = generateAss(finalSubtitles, [...segmentDurations, creditsText ? 5 : 0], totalDuration);
    assPath = join(DEFAULTS.outputDir, `subtitles-${ts()}.ass`);
    writeFileSync(assPath, assContent);
  }

  // ── Step 8: 燒錄字幕 + 片尾字卡 ──
  const finalPath = join(DEFAULTS.outputDir, `final-${ts()}.mp4`);
  if (assPath) {
    burnSubtitles(fullConcatPath, assPath, finalPath);
  } else {
    // 無字幕直接複製
    execSync(`cp "${fullConcatPath}" "${finalPath}"`);
  }

  // ── Step 9: 最終時長（含片尾） ──
  const finalDuration = getVideoDuration(finalPath);
  const finalBuf = readFileSync(finalPath);

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 9: 上傳至 Supabase 私有 bucket         ║");
  console.log("╚══════════════════════════════════════════════╝");

  const finalKey = `leo-004/${title.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_")}-${ts()}.mp4`;
  await uploadFinalVideo(finalBuf, finalKey);
  console.log(`  ✅ 已上傳: Videos/${finalKey}`);
  console.log(`  🏷️  大小: ${(finalBuf.length / 1024 / 1024).toFixed(1)} MB`);
  console.log("");

  // ── Step 10: DB 記錄 ──
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 10: 建立 course_videos 記錄 (draft)     ║");
  console.log("╚══════════════════════════════════════════════╝");

  const videoId = await insertCourseVideo({
    courseId: course_id,
    title,
    description: description || "",
    duration: finalDuration,
    storageKey: finalKey,
    sortOrder: 0,
  });
  console.log(`  ⚠️  狀態: draft（published_at = NULL）`);
  console.log(`  👤 待人工審核後發布`);

  // ── 匯總 ──
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  🎉 LEO-004 管線完成                         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  影片 ID  : ${videoId}`);
  console.log(`║  標題     : ${title}`);
  console.log(`║  角色     : ${charConfig.name}`);
  console.log(`║  時長     : ${finalDuration.toFixed(1)} 秒`);
  console.log(`║  段數     : ${segments.length}`);
  console.log(`║  檔案大小 : ${(finalBuf.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`║  Storage  : Videos/${finalKey}`);
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  💰 費用估算:                                 ║");
  console.log(`║  OmniHuman: ¥${(totalEstSec * 0.2).toFixed(2)}（從免費額度扣）`);
  console.log("║  TTS: < ¥0.05");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  ⚠️  狀態: draft，待人工審核後發布            ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
}

main().catch((err) => {
  console.error("❌ 管線執行失敗:", err.message);
  process.exit(99);
});
