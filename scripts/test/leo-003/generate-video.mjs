#!/usr/bin/env node
/**
 * LEO-003｜豹哥數字人講課測試樣片 — 即夢AI OmniHuman 1.5
 *
 * 流程:
 *   Step A: 豆包 TTS 生成旁白音頻 → 上傳至 Supabase 獲得公開 URL
 *   Step 1: 提交 OmniHuman 視頻生成任務 (圖 + 音頻)
 *   Step 2: 輪詢任務狀態
 *   Step 3: 下載視頻存檔
 *
 * 使用方式:
 *
 *   # 最小化（需自備公開音頻 URL）
 *   $env:VOLC_ACCESS_KEY='你的AK'
 *   $env:VOLC_SECRET_KEY='你的SK'
 *   $env:AUDIO_URL='https://example.com/narration.mp3'
 *   node scripts/test/leo-003/generate-video.mjs
 *
 *   # 完整流程（含豆包 TTS 自動生成音頻 + Supabase 上傳）
 *   $env:DOUBAO_TTS_APP_ID='你的AppId'
 *   $env:DOUBAO_TTS_ACCESS_TOKEN='你的AccessToken或APIKey'
 *   $env:SUPABASE_SERVICE_ROLE_KEY='你的ServiceKey'
 *   $env:NEXT_PUBLIC_SUPABASE_URL='你的SupabaseURL'
 *   node scripts/test/leo-003/generate-video.mjs
 *
 * 環境變數:
 *   ── OmniHuman 鑑權（必填）──
 *   VOLC_ACCESS_KEY      即夢AI Access Key ID
 *   VOLC_SECRET_KEY      即夢AI Secret Access Key
 *
 *   ── OmniHuman 參數（可選）──
 *   VOLC_REGION          區域，預設 cn-north-1
 *   OMNIHUMAN_REQ_KEY    req_key，預設 jimeng_omnihuman_v15
 *   REFERENCE_IMAGE_URL  豹哥定妝圖（預設同一張）
 *   AUDIO_URL            旁白音頻公開 URL（若不提供則自動 TTS 生成）
 *   PROMPT               可選文本引導（預設「交易員對著鏡頭講課，語氣自信專業」）
 *   OUTPUT_DIR           輸出目錄
 *   POLL_INTERVAL_MS     輪詢間隔 ms（預設 15s）
 *   MAX_WAIT_MS          最長等待 ms（預設 10 分鐘）
 *
 *   ── 豆包 TTS（若無 AUDIO_URL 則必填）──
 *   DOUBAO_TTS_APP_ID       豆包語音 App ID（新版控制台→語音技術→應用列表）
 *   DOUBAO_TTS_ACCESS_TOKEN 豆包語音 Access Token / API Key
 *   DOUBAO_TTS_SPEAKER_ID   音色 ID（預設 zh_male_taocheng_uranus_bigtts 小天2.0）
 *   TTS_TEXT                旁白文本（預設豹哥尼克李森教案）
 *
 *   ── 音頻上傳（優先 Supabase，備用 R2）──
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（主要）
 *   VIDEO_STORAGE_PROVIDER / VIDEO_STORAGE_BUCKET / VIDEO_STORAGE_ENDPOINT
 *   VIDEO_STORAGE_ACCESS_KEY_ID / VIDEO_STORAGE_SECRET_ACCESS_KEY（備用）
 *
 * 新用戶福利: 即夢AI 新用戶可領 100 秒免費額度，足夠測 5-6 次。
 * 若額度用完，充值 ¥50 即可（每次約 ¥3-4）。
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";

// ── 預設值 ──────────────────────────────────────────────────────────

const DEFAULTS = {
  region: "cn-north-1",
  service: "cv",
  action: "CVSubmitTask",          // OmniHuman submit
  queryAction: "CVGetResult",      // OmniHuman query
  version: "2022-08-31",
  endpoint: "https://visual.volcengineapi.com",
  reqKey: "jimeng_realman_avatar_picture_omni_v15",
  referenceImageUrl:
    "https://bpuqqyqmrtchaqfouygm.supabase.co/storage/v1/object/public/assets/bro_bao_master.png",
  prompt: "交易員對著鏡頭講課，語氣自信專業。背景是現代交易室，冷色調燈光。",
  outputDir: join(process.cwd(), "scripts", "test", "leo-003", "output"),
  maxWaitMs: 600_000,
  // TTS defaults — 豆包語音 v3 非流式接口
  ttsEndpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  ttsResourceId: "seed-tts-2.0",
  ttsSpeakerId: "zh_male_taocheng_uranus_bigtts", // 小天 2.0 — 年輕有力男聲
  ttsText:
    "這不是運氣差，是一場教科書級的事故。一九九五年，二十八歲的交易員尼克·李森，一個人搞垮了擁有兩百三十三年歷史的霸菱銀行。他本來該做最安全的套利交易，在新加坡和東京之間賺取微小價差。但他偷偷賭方向，把虧損藏進一個秘密的八八八八八帳戶，越輸越加倉。最終虧掉十四億美元。這堂課告訴我們，沒有風控的交易不是交易，是賭博。",
};

// ── 環境變數工具 ────────────────────────────────────────────────────

function env(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  return fallback;
}

// ── 格式工具 ────────────────────────────────────────────────────────

function formatElapsed(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 讀取環境變數 ────────────────────────────────────────────────────

const VOLC_AK = env("VOLC_ACCESS_KEY");
const VOLC_SK = env("VOLC_SECRET_KEY");
const REGION = env("VOLC_REGION", DEFAULTS.region);
const REQ_KEY = env("OMNIHUMAN_REQ_KEY", DEFAULTS.reqKey);
const IMAGE_URL = env("REFERENCE_IMAGE_URL", DEFAULTS.referenceImageUrl);
const AUDIO_URL = env("AUDIO_URL", "");  // empty = need TTS
const PROMPT = env("PROMPT", DEFAULTS.prompt);
const OUTPUT_DIR = env("OUTPUT_DIR", DEFAULTS.outputDir);
const POLL_MS = Number(env("POLL_INTERVAL_MS", DEFAULTS.pollIntervalMs));
const MAX_WAIT = Number(env("MAX_WAIT_MS", DEFAULTS.maxWaitMs));

// TTS env
const TTS_APP_ID = env("DOUBAO_TTS_APP_ID", "");
const TTS_ACCESS_TOKEN = env("DOUBAO_TTS_ACCESS_TOKEN", "");
const TTS_SPEAKER = env("DOUBAO_TTS_SPEAKER_ID", DEFAULTS.ttsSpeakerId);
const TTS_TEXT = env("TTS_TEXT", DEFAULTS.ttsText);
const TTS_RESOURCE_ID = env("DOUBAO_TTS_RESOURCE_ID", DEFAULTS.ttsResourceId);

// Supabase env (primary upload for audio)
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL", "");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", "");

// ── 檢查必填 ────────────────────────────────────────────────────────

function checkRequired() {
  let ok = true;
  if (!VOLC_AK) {
    console.error("❌ 缺少 VOLC_ACCESS_KEY 環境變數");
    ok = false;
  }
  if (!VOLC_SK) {
    console.error("❌ 缺少 VOLC_SECRET_KEY 環境變數");
    ok = false;
  }
  if (!IMAGE_URL) {
    console.error("❌ 缺少 REFERENCE_IMAGE_URL 環境變數");
    ok = false;
  }
  if (!ok) {
    console.error("");
    console.error("請設定環境變數後再執行。範例 (PowerShell):");
    console.error("  $env:VOLC_ACCESS_KEY='你的AK'");
    console.error("  $env:VOLC_SECRET_KEY='你的SK'");
    console.error("");
    console.error("完整環境變數說明請看腳本內註解或執行:");
    console.error("  node scripts/test/leo-003/generate-video.mjs --help");
    process.exit(1);
  }
}

// ── help ────────────────────────────────────────────────────────────

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("LEO-003｜豹哥數字人講課測試樣片");
  console.log("");
  console.log("環境變數:");
  console.log("  必填: VOLC_ACCESS_KEY, VOLC_SECRET_KEY");
  console.log("  輸入: AUDIO_URL 或 (DOUBAO_TTS_APP_ID + DOUBAO_TTS_ACCESS_TOKEN + TTS_TEXT)");
  console.log("  可選: VOLC_REGION, OMNIHUMAN_REQ_KEY, REFERENCE_IMAGE_URL, PROMPT,");
  console.log("         OUTPUT_DIR, POLL_INTERVAL_MS, MAX_WAIT_MS, TTS_SPEAKER_ID, TTS_TEXT");
  process.exit(0);
}

checkRequired();
mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Step A: 豆包 TTS 生成音頻（若無 AUDIO_URL）─────────────────────

let finalAudioUrl = AUDIO_URL;

async function ensureAudioUrl() {
  if (finalAudioUrl) {
    console.log("[A] 使用提供的音頻 URL 跳過 TTS");
    console.log(`     ${finalAudioUrl}`);
    return;
  }

  // 檢查 TTS 憑證
  if (!TTS_APP_ID || !TTS_ACCESS_TOKEN) {
    console.error("❌ 未提供 AUDIO_URL，且缺少豆包 TTS 憑證");
    console.error("   請設定 DOUBAO_TTS_APP_ID 和 DOUBAO_TTS_ACCESS_TOKEN");
    console.error("   或直接提供 AUDIO_URL 環境變數");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step A: 豆包 TTS 生成旁白音頻                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  文本長度: ${TTS_TEXT.length} 字`);
  console.log(`  音色: ${TTS_SPEAKER}`);

  // ── A.1 調用豆包 TTS API ──
  const ttsBody = {
    user: { uid: `leo-003-${randomUUID().slice(0, 8)}` },
    req_params: {
      text: TTS_TEXT,
      speaker: TTS_SPEAKER,
      audio_params: { format: "mp3", sample_rate: 24000 },
    },
  };

  console.log("  調用 TTS API …");
  let ttsResp;
  try {
    ttsResp = await fetch(DEFAULTS.ttsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": TTS_ACCESS_TOKEN,
        "X-Api-Resource-Id": TTS_RESOURCE_ID,
      },
      body: JSON.stringify(ttsBody),
    });
  } catch (err) {
    console.error(`❌ TTS API 網路錯誤: ${err.message}`);
    process.exit(2);
  }

  if (!ttsResp.ok) {
    const errText = await ttsResp.text().catch(() => "");
    console.error(`❌ TTS API 回傳 HTTP ${ttsResp.status}`);
    console.error(`   回應: ${errText.slice(0, 500)}`);
    if (ttsResp.status === 401 || ttsResp.status === 403) {
      console.error("   → 請檢查 DOUBAO_TTS_APP_ID / DOUBAO_TTS_ACCESS_TOKEN 是否正確");
      console.error("   → 確保已在火山引擎控制台開通豆包語音服務");
    }
    process.exit(3);
  }

  // 豆包 TTS v3 流式回應：多個 JSON 對象拼接，每個 data 字段為音頻塊
  // 需要收集所有 code===0 且有 data 的塊，拼接 base64 後解碼
  const ttsRaw = await ttsResp.text();
  const chunks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < ttsRaw.length; i++) {
    if (ttsRaw[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (ttsRaw[i] === "}") {
      depth--;
      if (depth === 0) {
        const obj = JSON.parse(ttsRaw.slice(start, i + 1));
        if (obj.code === 0 && obj.data) {
          chunks.push(obj.data);
        }
      }
    }
  }
  if (chunks.length === 0) {
    console.error("❌ TTS 回應中無音頻數據");
    process.exit(3);
  }
  const combinedBase64 = chunks.join("");
  const ttsBuffer = Buffer.from(combinedBase64, "base64");
  console.log(`  ✅ TTS 音頻生成完成 (${(ttsBuffer.length / 1024).toFixed(1)} KB, ${chunks.length} 個流式塊)`);

  // ── A.2 上傳音頻至 R2 或 Supabase 獲得公開 URL ──
  const audioFilename = `leo-003-tts-${Date.now()}.mp3`;
  const localAudioPath = join(OUTPUT_DIR, audioFilename);
  writeFileSync(localAudioPath, ttsBuffer);

  // 優先上傳至 Supabase（自有基礎設施）
  const supabaseUrl = await uploadAudioToSupabase(audioFilename, ttsBuffer);
  if (supabaseUrl) {
    finalAudioUrl = supabaseUrl;
    console.log(`  ✅ 音頻已上傳至 Supabase: ${finalAudioUrl}`);
  } else {
    // 備用：嘗試上傳到 R2
    const r2Url = await uploadAudioToR2(audioFilename, ttsBuffer);
    if (r2Url) {
      finalAudioUrl = r2Url;
      console.log(`  ✅ 音頻已上傳至 R2: ${finalAudioUrl}`);
    } else {
      console.error("❌ 音頻上傳失敗。請手動將音頻上傳到公開 URL 後");
      console.error(`   設定 AUDIO_URL 環境變數並重新執行。`);
      console.error(`   本地檔案: ${localAudioPath}`);
      process.exit(4);
    }
  }
}

/**
 * 上傳音頻到 R2，返回公開 URL（或 null）
 */
async function uploadAudioToR2(filename, buffer) {
  const provider = env("VIDEO_STORAGE_PROVIDER", "");
  const bucket = env("VIDEO_STORAGE_BUCKET", "");
  const endpoint = env("VIDEO_STORAGE_ENDPOINT", "");
  const ak = env("VIDEO_STORAGE_ACCESS_KEY_ID", "");
  const sk = env("VIDEO_STORAGE_SECRET_ACCESS_KEY", "");

  if (!provider || !bucket || !endpoint || !ak || !sk) {
    return null;
  }

  try {
    const [{ S3Client, PutObjectCommand }, { getSignedUrl }, { GetObjectCommand }] =
      await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@aws-sdk/s3-request-presigner"),
        import("@aws-sdk/client-s3"),
      ]);

    const s3 = new S3Client({
      endpoint: endpoint.replace(/\/+$/, ""),
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: ak, secretAccessKey: sk },
    });

    const key = `audio/${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
    }));

    // 產生 2 小時簽名 URL（足夠 OmniHuman 調用）
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 7200 },
    );
    return signedUrl;
  } catch (err) {
    console.error(`  ⚠ R2 上傳失敗: ${err.message}`);
    return null;
  }
}

/**
 * 備用上傳到 Supabase public storage
 */
async function uploadAudioToSupabase(filename, buffer) {
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL", "");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY", "");
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await sb.storage
      .from("assets")
      .upload(`tts/${filename}`, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (error) {
      console.error(`  ⚠ Supabase 上傳失敗: ${error.message}`);
      return null;
    }

    const { data: urlData } = sb.storage
      .from("assets")
      .getPublicUrl(`tts/${filename}`);

    return urlData?.publicUrl ?? null;
  } catch (err) {
    console.error(`  ⚠ Supabase 上傳失敗: ${err.message}`);
    return null;
  }
}

// ── Step 1: 提交 OmniHuman 視頻生成任務 ────────────────────────────

async function submitOmniHumanTask() {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 1: 提交 OmniHuman 視頻生成任務          ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Req Key   : ${REQ_KEY}`);
  console.log(`║  Region    : ${REGION}`);
  console.log(`║  參考圖    : ${IMAGE_URL}`);
  console.log(`║  音頻 URL  : ${finalAudioUrl}`);
  console.log(`║  Prompt    : ${PROMPT}`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  // 載入火山引擎簽名 SDK
  let Signer;
  try {
    const mod = await import("@volcengine/openapi");
    Signer = mod.Signer;
  } catch {
    console.error("❌ 缺少 @volcengine/openapi 依賴");
    console.error("   請執行: npm install @volcengine/openapi");
    process.exit(1);
  }

  const payload = {
    req_key: REQ_KEY,
    image_url: IMAGE_URL,
    audio_url: finalAudioUrl,
    prompt: PROMPT,
    seed: -1,
    pe_fast_mode: false,
  };

  const requestData = {
    region: REGION,
    method: "POST",
    params: { Action: DEFAULTS.action, Version: DEFAULTS.version },
    headers: {
      Region: REGION,
      Service: DEFAULTS.service,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  // HMAC-SHA256 簽名
  const signer = new Signer(requestData, DEFAULTS.service);
  signer.addAuthorization({
    accessKeyId: VOLC_AK,
    secretKey: VOLC_SK,
  });

  console.log("  提交任務 …");
  const submitUrl = `${DEFAULTS.endpoint}?Action=${DEFAULTS.action}&Version=${DEFAULTS.version}`;
  let submitResp;
  try {
    submitResp = await fetch(submitUrl, {
      method: "POST",
      headers: requestData.headers,
      body: requestData.body,
    });
  } catch (err) {
    console.error(`❌ 網路錯誤: ${err.message}`);
    process.exit(5);
  }

  const respText = await submitResp.text();
  let respJson;
  try {
    respJson = JSON.parse(respText);
  } catch {
    console.error(`❌ API 回傳非 JSON: HTTP ${submitResp.status}`);
    console.error(`   ${respText.slice(0, 500)}`);
    process.exit(6);
  }

  // OmniHuman 響應結構: { code: 10000, data: { task_id: "..." }, message: "Success" }
  if (!submitResp.ok || respJson.code !== 10000) {
    console.error(`❌ API 回傳錯誤: HTTP ${submitResp.status}`);
    console.error(`   code: ${respJson.code}, message: ${respJson.message}`);
    console.error(`   完整回應: ${JSON.stringify(respJson, null, 2).slice(0, 1000)}`);

    if (respJson.code === 10001 || respJson.code === 50501) {
      console.error("   → 可能是 req_key 無效或未開通該模型");
      console.error("   → 請用 OMNIHUMAN_REQ_KEY 環境變數指定正確的 req_key");
    }
    process.exit(7);
  }

  const taskId = respJson.data?.task_id;
  if (!taskId) {
    console.error("❌ API 未回傳 task_id");
    console.error(JSON.stringify(respJson, null, 2));
    process.exit(8);
  }

  console.log(`  ✅ 任務已建立: ${taskId}`);
  return taskId;
}

// ── Step 2: 輪詢任務狀態 ────────────────────────────────────────────

async function pollTask(taskId) {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 2: 輪詢任務狀態                         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  任務 ID   : ${taskId}`);
  console.log(`║  輪詢間隔  : ${POLL_MS / 1000}s`);
  console.log(`║  最長等待  : ${MAX_WAIT / 1000}s`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  const QUERY_ACTION = "CVGetResult";
  const startTime = Date.now();
  let pollCount = 0;

  // 載入簽名 SDK
  const { Signer } = await import("@volcengine/openapi");

  while (Date.now() - startTime < MAX_WAIT) {
    pollCount++;
    await sleep(POLL_MS);

    const queryPayload = {
      req_key: REQ_KEY,
      task_id: taskId,
    };

    const requestData = {
      region: REGION,
      method: "POST",
      params: { Action: QUERY_ACTION, Version: DEFAULTS.version },
      headers: {
        Region: REGION,
        Service: DEFAULTS.service,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    };

    const signer = new Signer(requestData, DEFAULTS.service);
    signer.addAuthorization({
      accessKeyId: VOLC_AK,
      secretKey: VOLC_SK,
    });

    const queryUrl = `${DEFAULTS.endpoint}?Action=${QUERY_ACTION}&Version=${DEFAULTS.version}`;
    let qResp;
    try {
      qResp = await fetch(queryUrl, {
        method: "POST",
        headers: requestData.headers,
        body: requestData.body,
      });
    } catch (err) {
      console.error(`  ⚠ 輪詢網路錯誤 (第 ${pollCount} 次): ${err.message}，重試…`);
      continue;
    }

    const qText = await qResp.text();
    let task;
    try {
      task = JSON.parse(qText);
    } catch {
      console.error(`  ⚠ 查詢回應非 JSON，重試…`);
      continue;
    }

    if (task.code !== 10000) {
      console.error(`  ⚠ 查詢失敗 code=${task.code} message=${task.message}，重試…`);
      continue;
    }

    const data = task.data ?? {};
    const status = (data.status ?? "").toLowerCase();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (status === "done" || status === "success" || status === "succeeded") {
      const videoUrl = data.video_url ?? data.video_urls?.[0];
      console.log(`  ✅ 生成成功！（耗時 ${formatElapsed(Number(elapsed))} / 共 ${pollCount} 次輪詢）`);
      if (!videoUrl) {
        console.error("  ❌ 任務完成但未回傳 video_url");
        console.error(JSON.stringify(task, null, 2).slice(0, 1000));
        process.exit(9);
      }
      return { videoUrl, data };
    }

    if (status === "failed" || status === "error") {
      console.error(`  ❌ 任務失敗（耗時 ${formatElapsed(Number(elapsed))}）`);
      console.error(`   ${JSON.stringify(data, null, 2).slice(0, 1000)}`);
      process.exit(10);
    }

    const label =
      { queued: "排隊中", running: "生成中", processing: "處理中" }[status] || status;
    console.log(`  ⏳ [${formatElapsed(Number(elapsed))}] ${label} (第 ${pollCount} 次輪詢)`);
  }

  console.error("");
  console.error("❌ 超過最長等待時間，視頻生成未完成。");
  console.error(`   任務 ID: ${taskId}`);
  console.error("   可稍後手動查詢。");
  process.exit(11);
}

// ── Step 3: 下載視頻 ────────────────────────────────────────────────

async function downloadVideo(videoUrl, taskId) {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Step 3: 下載視頻                             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  臨時 URL: ${videoUrl}`);
  console.log("  ⚠ 此 URL 約 24 小時內失效，請盡快轉存！");

  let videoBuffer;
  try {
    const dlResp = await fetch(videoUrl);
    if (!dlResp.ok) throw new Error(`HTTP ${dlResp.status}`);
    videoBuffer = Buffer.from(await dlResp.arrayBuffer());
  } catch (err) {
    console.error(`❌ 下載失敗: ${err.message}`);
    console.error("  請手動從以下 URL 下載（24h 內有效）:");
    console.error(`  ${videoUrl}`);
    process.exit(12);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputFilename = `leo-003-omnihuman-${timestamp}.mp4`;
  const outputPath = join(OUTPUT_DIR, outputFilename);

  writeFileSync(outputPath, videoBuffer);
  const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

  // ── 輸出匯總 ──
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  🎉 LEO-003 完成                              ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  輸出檔案 : ${outputPath}`);
  console.log(`║  檔案大小 : ${sizeMB} MB`);
  console.log(`║  Req Key  : ${REQ_KEY}`);
  console.log(`║  Task ID  : ${taskId}`);
  console.log(`║  參考圖   : ${IMAGE_URL}`);
  console.log(`║  音頻 URL : ${finalAudioUrl}`);
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  ⚠ 臨時視頻 URL（約 24h 內失效）:            ║");
  console.log(`║  ${videoUrl}`);
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  💰 定價參考:                                 ║");
  console.log("║  OmniHuman 1.5: ~¥0.20/秒（國內官方價）       ║");
  console.log("║  新用戶有 100 秒免費額度，充值 ¥50 可測多次   ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  return outputPath;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  LEO-003  豹哥數字人講課測試樣片               ║");
  console.log("║  OmniHuman 1.5 (即夢AI)                       ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  // Step A: 確保音頻 URL
  await ensureAudioUrl();

  // Step 1: 提交任務
  const taskId = await submitOmniHumanTask();

  // Step 2: 輪詢
  const { videoUrl } = await pollTask(taskId);

  // Step 3: 下載
  await downloadVideo(videoUrl, taskId);
}

main().catch((err) => {
  console.error("❌ 未預期的錯誤:", err);
  process.exit(99);
});
