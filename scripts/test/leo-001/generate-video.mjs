#!/usr/bin/env node
/**
 * LEO-001｜豹哥 EP01 測試樣片 — 火山方舟 Seedance 圖生視頻
 *
 * 使用方式（在專案根目錄執行）:
 *
 *   set ARK_API_KEY=你的API_Key
 *   node scripts/test/leo-001/generate-video.mjs
 *
 * 所有參數透過環境變數傳入，不寫死於程式碼。
 *
 * 環境變數:
 *   ARK_API_KEY          (必填) 火山方舟 API Key
 *   ARK_BASE_URL         (可選) 預設 https://ark.cn-beijing.volces.com/api/v3
 *   ARK_MODEL_ID         (可選) 預設 doubao-seedance-2-0-260128
 *   REFERENCE_IMAGE_URL  (可選) 預設豹哥定妝圖
 *   PROMPT               (可選) 預設豹哥測試樣片提示詞
 *   OUTPUT_DIR           (可選) 預設 scripts/test/leo-001/output
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── 預設值 ──────────────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  modelId: "doubao-seedance-2-0-260128",
  referenceImageUrl:
    "https://bpuqqyqmrtchaqfouygm.supabase.co/storage/v1/object/public/assets/bro_bao_master.png",
  prompt: [
    "豹哥（卡通雲豹、穿深色連帽衫）坐在多屏行情牆前，轉動座椅一甩、直視鏡頭，",
    "手裡轉著筆，眼神自信銳利、嘴角微揚，自然眨眼與輕微頭部動作；",
    "背景行情屏只顯示抽象K線與跳動數字，不得出現任何真實或可辨識的股票代號、公司名稱；",
    "現代交易室、冷色調燈光。",
  ].join(""),
  ratio: "9:16",
  duration: 5,
  resolution: "1080p",
  outputDir: join(process.cwd(), "scripts", "test", "leo-001", "output"),
  pollIntervalMs: 10_000,  // 10 秒輪詢一次
  maxWaitMs: 600_000,      // 最多等 10 分鐘
};

// ── 讀取環境變數 ─────────────────────────────────────────────────────

function env(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  return fallback;
}

const API_KEY   = env("ARK_API_KEY");
const BASE_URL  = env("ARK_BASE_URL",         DEFAULTS.baseUrl);
const MODEL_ID  = env("ARK_MODEL_ID",         DEFAULTS.modelId);
const IMAGE_URL = env("REFERENCE_IMAGE_URL",  DEFAULTS.referenceImageUrl);
const PROMPT    = env("PROMPT",               DEFAULTS.prompt);
const RATIO     = env("RATIO",                DEFAULTS.ratio);
const DURATION  = Number(env("DURATION",      DEFAULTS.duration));
const RESOLUTION = env("RESOLUTION",          DEFAULTS.resolution);
const OUTPUT_DIR = env("OUTPUT_DIR",          DEFAULTS.outputDir);
const POLL_MS   = Number(env("POLL_INTERVAL_MS", DEFAULTS.pollIntervalMs));
const MAX_WAIT  = Number(env("MAX_WAIT_MS",      DEFAULTS.maxWaitMs));

// ── 檢查必填 ─────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error("❌ 缺少 ARK_API_KEY 環境變數");
  console.error("");
  console.error("請先設定 API Key 後再執行：");
  console.error("");
  console.error("  Windows (CMD):  set ARK_API_KEY=你的API_Key");
  console.error("  Windows (PS):   $env:ARK_API_KEY='你的API_Key'");
  console.error("  macOS / Linux:  export ARK_API_KEY='你的API_Key'");
  console.error("");
  console.error("然後執行:");
  console.error("  node scripts/test/leo-001/generate-video.mjs");
  process.exit(1);
}

// ── 工具函式 ─────────────────────────────────────────────────────────

/** 格式化秒為 mm:ss */
function formatElapsed(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 建立輸出目錄 */
mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Step 1: 提交視頻生成任務 ────────────────────────────────────────

console.log("╔══════════════════════════════════════════════╗");
console.log("║  LEO-001  豹哥 EP01 測試樣片（圖生視頻）     ║");
console.log("╠══════════════════════════════════════════════╣");
console.log(`║  Base URL : ${BASE_URL}`);
console.log(`║  Model ID : ${MODEL_ID}`);
console.log(`║  輸出目錄 : ${OUTPUT_DIR}`);
console.log("╚══════════════════════════════════════════════╝");
console.log("");

const CREATE_URL = `${BASE_URL}/contents/generations/tasks`;

const payload = {
  model: MODEL_ID,
  content: [
    { type: "text", text: PROMPT },
    {
      type: "image_url",
      image_url: { url: IMAGE_URL },
      role: "first_frame",
    },
  ],
  ratio: RATIO,
  duration: DURATION,
  resolution: RESOLUTION,
  watermark: false,
};

console.log("[1/3] 提交視頻生成任務 …");
console.log("  提示詞長度:", PROMPT.length, "字元");

const createStart = Date.now();
let createResp;
try {
  createResp = await fetch(CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error("❌ 網路錯誤 — 無法連上火山方舟 API:", err.message);
  console.error("  請檢查網路連線或 BASE_URL 是否正確。");
  process.exit(2);
}

if (!createResp.ok) {
  const errText = await createResp.text().catch(() => "");
  console.error(`❌ API 回傳 HTTP ${createResp.status} ${createResp.statusText}`);
  console.error("  回應內容:", errText || "(無)");

  // 常見錯誤提示
  if (createResp.status === 401 || createResp.status === 403) {
    console.error("  → 可能是 API Key 無效或過期，請檢查。");
  } else if (createResp.status === 404) {
    console.error("  → 可能是端點路徑或 BASE_URL 錯誤。");
  } else if (createResp.status === 400 && errText.includes("model")) {
    console.error("  → 可能是模型 ID 不存在或未開通。");
    console.error("  → 請到火山方舟控制台確認已開通的模型 ID:");
    console.error("    https://console.volcengine.com/ark/region:ark+cn-beijing/model");
    console.error("  → 確認後用 ARK_MODEL_ID 環境變數指定正確的模型 ID。");
  }
  process.exit(3);
}

const createJson = await createResp.json();
const taskId = createJson.id;

if (!taskId) {
  console.error("❌ API 未回傳 task ID，完整回應:");
  console.error(JSON.stringify(createJson, null, 2));
  process.exit(4);
}

console.log(`  ✅ 任務已建立: ${taskId}`);
console.log(`  初始狀態: ${createJson.status || "—"}`);

// ── Step 2: 輪詢等待任務完成 ────────────────────────────────────────

const QUERY_URL = `${BASE_URL}/contents/generations/tasks/${taskId}`;

console.log("");
console.log("[2/3] 等待視頻生成完成 …");
console.log(`  輪詢間隔: ${POLL_MS / 1000}s ｜ 最長等待: ${MAX_WAIT / 1000}s`);

let videoUrl = null;
let finalTask = null;
let pollCount = 0;

while (Date.now() - createStart < MAX_WAIT) {
  pollCount++;
  await sleep(POLL_MS);

  let qResp;
  try {
    qResp = await fetch(QUERY_URL, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
  } catch (err) {
    console.error(`  ⚠ 輪詢網路錯誤 (第 ${pollCount} 次): ${err.message}，將重試…`);
    continue;
  }

  if (!qResp.ok) {
    const errTxt = await qResp.text().catch(() => "");
    console.error(`  ⚠ 查詢失敗 HTTP ${qResp.status}: ${errTxt}，將重試…`);
    continue;
  }

  const task = await qResp.json();
  const status = (task.status || "").toLowerCase();
  const elapsed = ((Date.now() - createStart) / 1000).toFixed(1);

  if (status === "succeeded") {
    finalTask = task;
    videoUrl = task.content?.video_url;
    console.log(`  ✅ 生成成功！（耗時 ${formatElapsed(Number(elapsed))} / 共 ${pollCount} 次輪詢）`);
    break;
  }

  if (status === "failed") {
    finalTask = task;
    const errInfo = task.error || {};
    console.error(`  ❌ 任務失敗（耗時 ${formatElapsed(Number(elapsed))}）`);
    console.error(`  錯誤代碼: ${errInfo.code || "—"}`);
    console.error(`  錯誤訊息: ${errInfo.message || "—"}`);
    console.error("  完整回應:", JSON.stringify(task, null, 2));
    process.exit(5);
  }

  if (status === "expired" || status === "cancelled") {
    finalTask = task;
    console.error(`  ❌ 任務狀態為「${status}」，無法繼續。`);
    process.exit(6);
  }

  // 還在排隊或執行中
  const statusLabel = { queued: "排隊中", running: "生成中" }[status] || status;
  console.log(`  ⏳ [${formatElapsed(Number(elapsed))}] ${statusLabel} (第 ${pollCount} 次輪詢)`);
}

if (!videoUrl) {
  console.error("");
  console.error("❌ 超過最長等待時間，視頻生成未完成。");
  console.error(`  任務 ID: ${taskId}`);
  console.error("  你可以稍後手動查詢狀態:");
  console.error(`    curl -H "Authorization: Bearer <API_KEY>" ${QUERY_URL}`);
  process.exit(7);
}

// ── Step 3: 下載視頻並存檔 ──────────────────────────────────────────

console.log("");
console.log("[3/3] 下載視頻 …");
console.log(`  臨時 URL: ${videoUrl}`);
console.log("  ⚠ 此 URL 約 24 小時內失效，請盡快轉存！");

let videoBuffer;
try {
  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) {
    throw new Error(`HTTP ${dlResp.status} ${dlResp.statusText}`);
  }
  videoBuffer = Buffer.from(await dlResp.arrayBuffer());
} catch (err) {
  console.error(`❌ 下載視頻失敗: ${err.message}`);
  console.error("  請手動從以下 URL 下載（24h 內有效）:");
  console.error(`  ${videoUrl}`);
  process.exit(8);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outputFilename = `leo-001-bro-bao-ep01-${timestamp}.mp4`;
const outputPath = join(OUTPUT_DIR, outputFilename);

writeFileSync(outputPath, videoBuffer);
const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

// ── 輸出匯總 ─────────────────────────────────────────────────────────

console.log("");
console.log("╔══════════════════════════════════════════════╗");
console.log("║  🎉 LEO-001 完成                             ║");
console.log("╠══════════════════════════════════════════════╣");
console.log(`║  輸出檔案 : ${outputPath}`);
console.log(`║  檔案大小 : ${sizeMB} MB`);
console.log(`║  使用模型 : ${MODEL_ID}`);
console.log(`║  任務 ID  : ${taskId}`);
console.log(`║  畫面比例 : ${RATIO}`);
console.log(`║  解析度   : ${RESOLUTION}`);
console.log(`║  時長     : ${DURATION}s`);
console.log("╠══════════════════════════════════════════════╣");
console.log("║  ⚠ 臨時視頻 URL（約 24h 內失效）:           ║");
console.log(`║  ${videoUrl}`);
console.log("╚══════════════════════════════════════════════╝");
console.log("");

// ── 輔助 ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
