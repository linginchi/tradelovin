// LEO-006 連通測試：Supabase + 火山即夢
const { createClient } = require("@supabase/supabase-js");

async function testSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("Supabase URL:", url ? "SET" : "MISSING");
  console.log("Supabase KEY:", key ? `SET (前8字: ${key.slice(0,8)}...)` : "MISSING");
  if (!url || !key) return false;

  const sb = createClient(url, key);
  const { data, error } = await sb.from("courses").select("id,title").limit(3);
  if (error) { console.log("❌ Supabase 查詢失敗:", error.message); return false; }
  console.log("✅ Supabase 連通:", JSON.stringify(data));
  return true;
}

async function testVolcOmniHuman() {
  const ak = process.env.VOLC_ACCESS_KEY;
  const sk = process.env.VOLC_SECRET_KEY;
  console.log("\n火山 AK:", ak ? `SET (前8字: ${ak.slice(0,8)}...)` : "MISSING");
  console.log("火山 SK:", sk ? "SET" : "MISSING");
  if (!ak || !sk) return false;

  const { Signer } = require("@volcengine/openapi");
  const requestData = {
    region: "cn-north-1",
    method: "POST",
    params: { Action: "CVGetResult", Version: "2022-08-31" },
    headers: { Region: "cn-north-1", Service: "cv", "Content-Type": "application/json" },
    body: JSON.stringify({ req_key: "jimeng_realman_avatar_picture_omni_v15", task_id: "000000" }),
  };
  const signer = new Signer(requestData, "cv");
  signer.addAuthorization({ accessKeyId: ak, secretKey: sk });

  const resp = await fetch("https://visual.volcengineapi.com?Action=CVGetResult&Version=2022-08-31", {
    method: "POST",
    headers: requestData.headers,
    body: requestData.body,
  });
  const json = await resp.json();
  // 用假 task_id 預期會報錯，但只要簽名過關就是連通
  const ok = json.code !== undefined && resp.status !== 401 && resp.status !== 403;
  console.log(ok ? "✅ 火山即夢簽名驗證通過 (HTTP " + resp.status + ")" : "❌ 火山即夢簽名失敗", JSON.stringify(json).slice(0,150));
  return ok;
}

async function testDoubaoTTS() {
  const token = process.env.DOUBAO_TTS_ACCESS_TOKEN;
  console.log("\n豆包 TTS Token:", token ? `SET (前8字: ${token.slice(0,8)}...)` : "MISSING");
  if (!token) return false;

  const resp = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": token, "X-Api-Resource-Id": "seed-tts-2.0" },
    body: JSON.stringify({ user: { uid: "test" }, req_params: { text: "測試", speaker: "zh_male_taocheng_uranus_bigtts", audio_params: { format: "mp3", sample_rate: 24000 } } }),
  });
  const text = await resp.text();
  const ok = text.includes('"code":0') || text.includes('"data":"');
  console.log(ok ? "✅ 豆包 TTS 連通" : "❌ 豆包 TTS 失敗", text.slice(0,150));
  return ok;
}

(async () => {
  const s1 = await testSupabase();
  const s2 = await testVolcOmniHuman();
  const s3 = await testDoubaoTTS();
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Supabase:  ${s1 ? "✅" : "❌"}`);
  console.log(`火山即夢:  ${s2 ? "✅" : "❌"}`);
  console.log(`豆包 TTS:  ${s3 ? "✅" : "❌"}`);
})();
