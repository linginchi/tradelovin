# TODOS 清單

此文件追蹤在 `/plan-ceo-review` / `/plan-eng-review` / `/plan-design-review` 中明確延遲的所有工作項目。按優先級排序（P1 > P2 > P3）。

---

## 來自 CEO Review (2026-06-17)

### P2 — 多語言擴展

**What:** 當華語市場站穩後，擴展 AI 管線到英→日、中→英等語言對。

**Why:** 豹哥 IP 的國際化潛力 — 日語市場對 AI 金融資訊也有強需求。管線架構（翻譯 prompt + TTS voice）只需新增設定即可支援。

**Cons:** 需要對每種語言的翻譯品質進行獨立驗證；TTS 語音的自然度在不同語言中表現不同。

**Context:** 管線目前僅支援英→繁體中文。擴展只需在 `translateAndSegment` 中增加語言選項，在 `generateTTS` 中選用對應語言的 voice。OpenAI TTS 已支援日語（nova/kensho 等 voice）。

**Effort estimate:** M (human) / S (CC+gstack) | **Priority:** P2

---

### P2 — 內容品質人工審核

**What:** Admin UI 中的 AI 影片審核模式 — 管理員可預覽翻譯、編輯字幕、或退回重做。

**Why:** AI 管線的翻譯和分段可能不總是完美。專業交易術語的翻譯錯誤會損害平台信譽。人工審核提供品質保證層。

**Cons:** 增加發布延遲（從即時到審核後發布）；需要至少一個管理員定期審核內容。

**Context:** 在 AdminAiPipelinePanel 中為每個 completed job 增加「審核」按鈕。審核頁面顯示影片預覽 + 可編輯的字幕文本。通過後影片標記為 `reviewed`，退回後建立新的修正管線工作。

**Effort estimate:** M (human) / M (CC+gstack) | **Priority:** P2

---

### P2 — 多 KOL 共用管線

**What:** 讓第二位及後續的 KOL 也能使用 AI 管線加工自己的長影片（自動分段、加字幕、TTS 雙語或豹哥配音）。

**Why:** KOL 真人影片的製作瓶頸是後期（分段、字幕、語音）。AI 管線可以在不替代 KOL 內容的前提下大幅降低後期成本，讓 KOL 更快產出更多內容。

**Cons:** KOL 可能不喜歡 AI 語音替代自己的聲音（可選用 KOL 自己的聲音 clone）；管線 UI 需要支援課程/影片的關聯選擇。

**Context:** 目前管線僅支援 AI 搜尋模式。需要新增「手動上傳」入口，讓 KOL 上傳自己的影片，選擇輸出設定（字幕語言、TTS 或保留原聲、是否分段等），然後觸發管線。

**Effort estimate:** L (human) / M (CC+gstack) | **Priority:** P2

---

### P3 — B 端產品化（券商研究摘要影片）

**What:** 讓券商客戶也能使用 AI 管線快速製作金融研究影片。

**Why:** TradeLovin 的廣告客戶（券商/基金）有大量內部研報需要轉化為影片。AI 管線的「文字→影片」能力可以作為 B 端 SaaS 產品賣給這些客戶，成為第二收入線。

**Cons:** 需要獨立的 B 端產品線（定價、UI、支援）；券商合規要求嚴格，需要內容審查層。

**Context:** 管線的「搜尋→翻譯→TTS→合成」流程本質上可處理任何文字輸入。可以將券商的研究報告直接輸入為 LLM 腳本，跳過搜尋和下載步驟。

**Effort estimate:** XL (human) / L (CC+gstack) | **Priority:** P3
