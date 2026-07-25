// LEO-004 翻譯模組連通測試（DeepSeek）
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.log("❌ DEEPSEEK_API_KEY 未設定"); process.exit(1); }

console.log("DEEPSEEK_API_KEY:", "SET");
console.log("测试翻译…");

const zhList = [
  "這不是運氣差",
  "是一場教科書級的事故",
  "一九九五年，二十八歲的交易員尼克·李森",
];

const prompt = `你是一個專業財經翻譯。將以下中文逐句翻譯成英文。術語對照：尼克·李森=Nick Leeson, 霸菱銀行=Barings Bank, 套利=arbitrage, 風控=risk control
輸出純 JSON 陣列，每個元素為 {"zh":"原文","en":"譯文"}，不要任何其他文字：
${JSON.stringify(zhList)}`;

(async () => {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com/v1" });
  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1000,
  });
  const raw = resp.choices[0].message.content.trim();
  console.log("原始回應:", raw.slice(0, 200));
  const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonStr);
  console.log("解析結果:");
  parsed.forEach((item, i) => console.log(`  [${i}] ZH: ${item.zh} | EN: ${item.en}`));
  console.log("\n✅ DeepSeek 翻譯暢通");
})();
