# Handoff：首页 / 页脚新口号（Windows → Mac Cursor）

**日期：** 2026-08-28  
**远程：** `https://github.com/linginchi/tradelovin.git`  
**分支：** `main`（`origin/main` @ `5090f98` 仍是旧口号）  
**生产：** https://leolearnstotrade.com · 预览 https://tradelovin.mark-377.workers.dev  
**本文目的：** 给 **Mac Cursor** 在干净 `main` 上改文案、提交、部署。Windows 本机有脏树，**不要**从那边拷整棵工作区。

先 `git pull origin main`，再按 §3 做。只改口号相关文件。

---

## 0. 为什么线上还是旧口号

| 事实 | 说明 |
|------|------|
| `origin/main` **没有**新口号 | `Home.subtitle` / `Footer.tagline` / `Metadata.siteDescription` 仍是旧句。CI / Mac 从 `main` 构建就会发布旧文案。 |
| Windows 2026-08-25 曾 `npm run deploy:cloudflare` | 从**未提交**的脏工作区直接打 Worker。版本当时是 `5ee6ca37-2d45-4e0f-af70-623c22374ed9`。 |
| 首页英雄区在 `main` **根本不渲染** subtitle | `src/app/[locale]/page.tsx` 只有 `{t("title")}`。用户在首屏只看到「新紮學豹」，看不到口号。 |
| 页脚才是用户最容易对照的位置 | `SiteFooter` 已绑定 `Footer.tagline`。`main` 上简体仍是「跟豹叔豹哥，领略交易高手的成与败」。 |
| Windows 脏树还混着播放栈 / 广发 QR 等 | **禁止**把那些文件一并提交或部署进这次口号任务。播放冻结见 `.cursor/rules/video-playback-freeze.mdc`。 |

结论：要让口号生效，必须在 **干净 `main`** 改 4 个文件 → **commit + push** → **再部署**。只本地 deploy、不 push，下一台机器或 CI 仍会盖回旧句。

---

## 1. 已拍板的文案（勿改写）

用户原文（繁体）：**跟豹叔豹哥，重溫交易高手的成長之路**

| locale | 口号正文 | 站点描述（`Metadata.siteDescription`） |
|--------|----------|----------------------------------------|
| `zh` | 跟豹叔豹哥，重温交易高手的成长之路 | 新紮學豹 — 跟豹叔豹哥，重温交易高手的成长之路 |
| `zh-TW` | 跟豹叔豹哥，重溫交易高手的成長之路 | 新紮學豹 — 跟豹叔豹哥，重溫交易高手的成長之路 |
| `en` | With Uncle Bao and Bro Bao, revisit the growth path of trading masters | Leo Learns To Trade — With Uncle Bao and Bro Bao, revisit the growth path of trading masters |

同一句用于：

- `Home.subtitle`（首页英雄区标题下方）
- `Footer.tagline`（全站页脚品牌旁）

**不要动** `Lab.tagline`（实验室产品说明，不是品牌口号）。  
**不要动** 其它 namespace 里的 `subtitle`（交易页、个人资料、后台等）。

### `origin/main` 上要替换的旧句

| 键 | zh（旧） | zh-TW（旧） | en（旧） |
|----|----------|-------------|----------|
| `Home.subtitle` | 以原创卡通豹角色讲述知名交易员的成败案例，课堂式干货拆解。 | 以原創卡通豹角色講述知名交易員的成敗案例，課堂式乾貨拆解。 | With Uncle Bao & Bro Bao — classroom breakdowns of famous traders' wins and failures. |
| `Footer.tagline` | 跟豹叔豹哥，领略交易高手的成与败 | 跟豹叔豹哥，領略交易高手的成與敗 | Learn the triumphs and disasters of trading's greatest, with Uncle Bao & Bro Bao |
| `Metadata.siteDescription` | 新紮學豹 — 交易训练与量化投研学习平台 | 新紮學豹 — 交易訓練與量化投研學習平台 | Leo Learns To Trade — trading training and quant research learning platform |

---

## 2. 只改这些文件

1. `messages/zh.json` — 上表三个键  
2. `messages/zh-TW.json` — 上表三个键  
3. `messages/en.json` — 上表三个键  
4. `src/app/[locale]/page.tsx` — 在 `<h1>{t("title")}</h1>` **正下方**增加 subtitle（`main` 现在没有这段）：

```tsx
<p className="max-w-xl text-base leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] md:text-lg">
	{t("subtitle")}
</p>
```

页脚 **不用改组件**：`src/components/shared/SiteFooter.tsx` 已渲染 `{tFooter("tagline")}`。  
站点 SEO **不用改 layout**：`src/app/[locale]/layout.tsx` 已用 `Metadata.siteDescription`。

改完后：

```bash
node -e "for (const f of ['messages/zh.json','messages/zh-TW.json','messages/en.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('ok', f); }"
rg -n "领略交易高手|成与败|成與敗|triumphs and disasters|classroom breakdowns of famous" messages src
```

`rg` 应无匹配（文档与本 handoff 除外）。

---

## 3. Mac 操作顺序

```bash
cd ~/Projects/tradelovin   # 或本机 clone 路径；见 2026-08-04 handoff 的 tradelovin-dev
git checkout main
git pull origin main
# 工作区必须干净。若有 WIP，先 stash / 另开分支，不要混进口号 commit
```

1. 按 §1 / §2 改 4 个文件。  
2. **单独 commit**（不要带播放、QR、wrangler 密钥、`.env`）。建议信息：

   `fix(copy): homepage and footer slogan to 重温交易高手的成长之路`

3. `git push origin main`（或先开 PR 再合；合进 `main` 后 GitHub Actions 会 `deploy:cloudflare`，见 `DEPLOY.md` §6.2）。  
4. 若要本机立刻上线：先读 [`DEPLOY.md`](../DEPLOY.md) **§2**，再 `npm run deploy:cloudflare`。Mac 一般无 Windows `.open-next` EBUSY 问题。  
5. **push 后再 deploy**。只 deploy 不 push，下一台机器仍会以为没改。

---

## 4. 验收（改完必须做）

硬刷新（避免 CDN / 浏览器缓存）：

| 页面 | 应看到 |
|------|--------|
| https://leolearnstotrade.com/zh | 英雄区标题下 + 页脚均为「跟豹叔豹哥，重温交易高手的成长之路」 |
| https://leolearnstotrade.com/zh-TW | 「跟豹叔豹哥，重溫交易高手的成長之路」 |
| https://leolearnstotrade.com/en | 英文新句 |
| 任意带页脚的内页（如 `/zh/courses`） | 页脚已换新句，不再出现「领略 / 領略 / 成与败」 |

```bash
curl -sS https://leolearnstotrade.com/zh | grep -o '跟豹叔豹哥[^<]*'
curl -sS https://leolearnstotrade.com/zh-TW | grep -o '跟豹叔豹哥[^<]*'
```

应出现 **重温** / **重溫**，不应再出现 **领略** / **領略**。

---

## 5. 禁止事项（Mac 代理必须遵守）

- **不要**改播放冻结文件（无用户原文 `CEO批准视频播放`）：  
  `src/app/api/courses/[courseId]/videos/[videoId]/play/route.ts`  
  `src/app/api/admin/courses/[courseId]/videos/[videoId]/play/route.ts`  
  `src/lib/video/storage.ts`  
  `src/components/video/VideoPlayerClient.tsx`
- **不要**为改口号去动 `PartnerQrSlot` / `partner-qr.ts` / `public/partner-qr.png`。  
- **不要**从 Windows 工作区 `git add` 整棵脏树（播放修复、QR、freeze lock、leo 测试视频等）。  
- **不要**改 `NEXT_PUBLIC_SUPABASE_URL`、Worker secrets、`wrangler.jsonc` 的 `routes`。  
- 仓库根 [`wrangler.jsonc`](../wrangler.jsonc) **未提交 `routes`**；自定义域在 Dashboard。部署若警告远程路由不一致，核自定义域，不要当失败。

---

## 6. Windows 会话背景（只读，勿复用脏树）

- 口号需求：用户要改「首页底部以及其他地方」为新句。  
- Windows 本地已改过 §2 四个文件，但 **从未 commit / push**。  
- 同工作区还堆着 2026-08 播放闸门、广发 QR、freeze CI 等未提交改动；与本任务无关。  
- 相关规则：[`AGENTS.md`](../AGENTS.md)「视频播放冻结」；[`DEPLOY.md`](../DEPLOY.md) §2。

---

## 7. 做完后回写

在本文件或新 commit 里记：

- commit SHA  
- Worker Version ID（`wrangler deploy` 日志）  
- `curl` / 浏览器三语验收结果  

然后告诉用户：硬刷新 `/zh`、`/zh-TW` 看英雄区与页脚。
