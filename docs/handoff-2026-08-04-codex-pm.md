# Handoff：Codex（产品经理 / 验收反馈）↔ Cursor Agent（工程实现）

**日期：** 2026-08-04  
**工作区（双方共用）：** `/Users/linginchi/Projects/tradelovin-dev`  
**远程仓库：** `linginchi/tradelovin`  
**生产站：** https://leolearnstotrade.com  
**生产当前 release SHA：** `4cfff350585d42c900ad5408778903c62ae102ab`（含豹哥播放修复 #22 + 视频页三卡片 #21）

---

## 1. 角色分工（请严格遵守）

| 角色 | 谁 | 职责 |
|------|----|------|
| **产品经理 + 验收反馈** | **Codex**（本机同一 folder） | 对照验收标准测生产/预发；整理缺陷与优先级；确认产品意图；给 Cursor 写清「要什么 / 不要什么 / 怎么验」；不代替写大段业务代码 |
| **工程实现** | **Cursor Agent（Grok / 本会话延续）** | 读 Codex 反馈后改代码、写测试、开/修 PR、部署相关技术动作；跟进 CI 红灯 |

协作约定：

1. Codex 在本 folder 只做**只读探查 + 文档/验收清单 + 反馈**；需要改代码时，把结论写成明确工单交给 Cursor。
2. Cursor 实现前优先看本 handoff 与 `docs/superpowers/specs|plans` 里已确认设计。
3. **不要**在 `/Users/linginchi/Projects/tradelovin`（Lab）上做生产合并/大改；生产向工作只在 **`tradelovin-dev`**。
4. 合并生产优先用 **GitHub PR squash merge**；勿在 Lab 脏树上 `checkout main` / 本地 merge。

### 1.1 双 folder 怎么用（2026-08-04 冻结）

| 路径 | 用途 | 还要吗？ |
|------|------|----------|
| `/Users/linginchi/Projects/tradelovin-dev` | **日常唯一入口**：生产代码、Codex 验收、Cursor 实现 | **是，默认打开这个** |
| `/Users/linginchi/Projects/tradelovin` | Lab / 交易台实验 WIP；同一 git 仓库的另一 worktree | **保留目录、勿删**；不是第二套生产站。仅做 Lab 时再打开 |

- 二者是同一远程的不同 worktree，不是两套无关代码。
- Lab WIP 归档分支：`lab/wip-archive-2026-08`（本地；含归档时的未提交实验改动）。本地 `main` 应对齐 `origin/main`，不再长期堆脏 WIP。
- 规则文件：`.cursor/rules/workspace-role.mdc`。

---

## 2. 产品最新状态（截至 2026-08-04）

### 2.1 已上线、可验收（生产 `4cfff35`）

| 项 | 状态 | 说明 |
|----|------|------|
| 忘记密码 / magic-link「链接无效或已过期」 | **已修** | 根因链：Workers 上 SSR 密码 grant 失败 → cookie 未写 → `/api/auth/me` 用错误 anon key（`Unregistered API key`）。已修 mint/session cookies + 仓库 secret 换成有效 legacy JWT anon。相关 PR #13–#15、#20。 |
| 游客教学视频免费 10 秒 | **数据已开** | 第 1–5 课 `is_free_preview=true`；play API 返回 `preview.maxSeconds=10`；媒体 R2 `206`。 |
| 豹哥·交易新銳不能播 | **已修并部署** | 文件在 **Supabase Storage 桶 `Videos`**，路径 `leo-004/_-2026-06-28T02-12-17.mp4`；播放曾误签 R2 → 404。#22 已合并：非 `videos/` 前缀 key 走 Supabase signed URL。生产实测 host=`*.supabase.co`，媒体 `206`。 |

**建议 Codex 立刻回归：**

- `mark@hkfac.com`：忘记密码 → 新邮件 → 点链 → 应进入个人页且保持登录（勿用旧邮件）。
- 游客：任意第 1–5 课 → 可播约 10 秒后截断 CTA。
- 登录/游客：豹哥《尼克·李森…》→ 应能出画面（非黑屏）。

### 2.2 工程门禁 / 已上线状态（2026-08-04）

| 项 | 状态 | 说明 |
|----|------|------|
| **视频页三卡片**（交易经典 / 录播教学 / 课程直播） | **已合并并上线** | PR：https://github.com/linginchi/tradelovin/pull/21 — **MERGED**（squash `4cfff35`，2026-08-04）。线上 `/api/course-topics` 已 200 返回三 topic；`/courses` 首屏三卡。 |
| 三卡 **生产数据** | **已落地** | Topic：`交易经典`(10)、`录播教学`(20)、`课程直播`(30)；豹哥+豹叔→经典；1–5课→录播；直播 0 课；「A股基础知识」`topic_id=null`。 |
| 设计/计划 | 已写 | Spec：`docs/superpowers/specs/2026-07-31-video-hub-three-cards-design.md`；Plan：`docs/superpowers/plans/2026-07-31-video-hub-three-cards.md`（若当前 checkout 无此文件，见 PR #21 / worktree） |

**PR #21 CI 已修通（2026-08-04，commit `1e0e967`）：**

1. **TypeScript 强转**：`src/app/api/courses/route.ts` L65/68/72/76 改为 `as unknown as Record<string, unknown>[] | null`。
2. **session-handoff 导入警告**：`signSessionHandoff` / `verifySessionHandoff` 实现迁入 `session-handoff.mjs`（`.d.ts` 同步、`.ts` 改再导出），import 警告消除。该问题 main 上原已存在（非 #21 引入），本次一并修掉。
3. 部署 run `30879929303` 的指纹步骤曾因 Cloudflare 传播延迟报 mismatch（窗口内仍返回旧 `9d1edf7`）；生产实测已为 `4cfff35`，发布生效。

本地 worktree（若仍在）：

- `/Users/linginchi/Projects/tradelovin-dev/.worktrees/video-hub-three-cards`  
- 分支：`feat/video-hub-three-cards`

### 2.3 设计已确认、实现未做

| 项 | 文档 | 备注 |
|----|------|------|
| 豹哥人气基线 + 优先增长 | `docs/superpowers/specs/2026-07-30-baoge-marketing-boost-design.md` | 只动 `marketing_view_count`；**不碰播放**。代码 BOOST 特例可能尚未合入，Codex 验收时勿与「能播」混淆。 |
| 海外域名 Phase 2 | `docs/superpowers/specs|plans/2026-07-30-phase2-overseas-domain-cutover*`、`ops/phase2-overseas-domain-cutover/CHECKLIST.md` | 入口/域名切流；与视频三卡独立。 |

### 2.4 LEO Handoff 合并（2026-08-04，分支 `feat/leo-handoff-merge`）

| 项 | 状态 | 说明 |
|----|------|------|
| LEO-004 管线脚本 | **已合入本分支** | `scripts/test/leo-004/`；INSERT `published_at=null`（draft） |
| LEO-008 审片发布台 | **已合入本分支** | `/cjkzt/video-publish`；迁移 `published_at` + 公开 list/play 过滤 |
| LEO-005 首页换图 | **已合入本分支** | `home_hero_v1`；**保留四入口** |
| LEO-007 品牌改名 | **已合入本分支** | 新紮學豹 / Leo Learns To Trade；**未改** FPS 户名 |
| 设计说明 | 已写 | `docs/superpowers/specs/2026-08-04-leo-handoff-merge-design.md` |

**仍不做：** 配额制 `content_kind`、FPS 公司名、Lab AI Quant 归档、旧 KOL AI pipeline。

---

## 3. 关键架构备忘（验收时少踩坑）

### 播放栈

- 教学课（`storage_key` 以 `videos/` 开头）→ **R2** `jianbao-videos` 签名 URL。
- 豹哥等 Leo 片（如 `leo-004/...`）→ **Supabase Storage `Videos`** 签名 URL（#22 后）。
- 免费试看：**服务端**发完整 signed URL + `preview.limited`；**客户端**掐 10 秒（非服务端裁片）。
- 权限：`is_free_preview` 或 报名 `approved|paid` / 超管。

### 入口域名

- 主域：`leolearnstotrade.com`（canonical）。
- 内地入口 `xeoaxis.com` 等有 middleware / magic-link Host 优先规则；详见 `docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md`。

### Auth 近期坑（已修，回归时关注）

- Workers 上勿依赖 `@supabase/ssr` `signInWithPassword` / `setSession` 写 cookie。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 必须在 **CI build 时**注入；错误 publishable key 会导致 `getUser` → `Unregistered API key`。
- 当前有效 anon 为 **legacy JWT**（已设 gh secret）；勿再塞未注册的 `sb_publishable_TWBb…`。

---

## 4. Codex 建议工作流（本 folder）

1. `cd /Users/linginchi/Projects/tradelovin-dev`；`git fetch origin`；以 `origin/main` 为生产对照基线。
2. 用浏览器 / curl 对生产做验收表（§5）；缺陷写成：
   - **现象** / **复现步骤** / **期望** / **优先级（P0–P2）** / **是否阻塞上线**
3. 三卡相关：在 PR #21 合并前，**不要**把「线上仍是扁平课程列表」当成回归；那是未部署。
4. 需要 Cursor 改代码时，在对话或 `docs/` 下短工单点名文件/验收标准即可。
5. 避免：擅自改 Lab 树、擅自 push --force main、擅自清生产数据。

---

## 5. 验收清单（Codex 主责）

### P0 — 生产应已绿

- [ ] Magic-link / 忘记密码：新邮件可登录，`/api/auth/me` → `loggedIn: true`
- [ ] 游客第 1–5 课：列表可见 + 可播 + ~10s 截止
- [ ] 豹哥视频：登录与游客均可出片（Supabase signed URL）

### P1 — 三卡（已上线，2026-08-04 验收）

- [x] `/courses` 首屏仅三卡：交易经典 / 录播教学 / 课程直播（页面 RSC 已含三卡标题与「敬请期待」）
- [x] 经典 = 豹哥 + 豹叔（深链 count=2）；录播 = 五课（count=5）；直播 =「敬请期待」（count=0）
- [x] `?topic=<uuid>` 深链（经典 `0d21bc12…`、录播 `3e16aca0…` 过滤正确）；非法 topic → 400 回退三卡
- [x] 课程列表失败时仍有「返回分区」（client fallback；video-hub contract tests 6/6）

### P2 — 产品债 / 跟进

- [ ] 豹哥人气 3589 + 1.2× 日增（营销 design，未实现则记为 backlog）
- [x] PR #21 CI 类型错误修通并合并（`1e0e967` → squash `4cfff35`）
- [ ] 后台创建 topic 时避免再占用 sort_order 10/20/30 造成重复卡（终审曾提 partial unique）

---

## 6. Cursor 待办队列（给 Codex 排期用）

1. ~~修 PR #21 CI → 合并 → 验证线上三卡~~ **已完成**（`1e0e967` 修复、`4cfff35` 合并部署、P1 验收通过）。
2. （可选）豹哥营销 boost 按 2026-07-30 design 实现。  
3. （可选）play 失败时更清晰错误（媒体 404 vs 无权限），减少「黑屏无文案」。
4. **合并并部署** `feat/leo-handoff-merge`（LEO-004/005/007/008）；部署前对生产执行 `published_at` migration。
5. Codex 验收：审片台草稿不可见游客；发佈后交易经典可见；首页 hero + 四入口 + 三语品牌截图。

---

## 7. 关键链接与路径

| 资源 | 位置 |
|------|------|
| 生产 | https://leolearnstotrade.com |
| Release API | `/api/deploy/version` |
| 三卡 PR | https://github.com/linginchi/tradelovin/pull/21 |
| 豹哥播放修复 PR | https://github.com/linginchi/tradelovin/pull/22（已合） |
| 三卡 spec | `docs/superpowers/specs/2026-07-31-video-hub-three-cards-design.md` |
| 三卡 plan | `docs/superpowers/plans/2026-07-31-video-hub-three-cards.md` |
| 豹哥人气 design | `docs/superpowers/specs/2026-07-30-baoge-marketing-boost-design.md` |
| xeoaxis 入口 | `docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md` |
| 部署注意 | `DEPLOY.md`（含 Windows `.open-next` 占用） |
| Supabase project | `bpuqqyqmrtchaqfouygm` |
| 豹哥 video id | `7e742344-5a40-471e-b2ea-53e8553702df` |
| 测试账号（曾用） | `mark@hkfac.com` |

---

## 8. 给 Codex 的开场指令（可直接粘贴）

> 你在 `/Users/linginchi/Projects/tradelovin-dev` 担任**产品经理与验收反馈**。Cursor Agent 负责写代码。请先阅读 `docs/handoff-2026-08-04-codex-pm.md`（含 §1.1 双 folder），对生产站（当前 release `4cfff35`）做 §5 P0 回归与三卡 P1 验收（三卡已于 2026-08-04 上线）。把发现的问题按 P0/P1/P2 列成工单交给 Cursor；不要打开/依赖 Lab 目录 `/Users/linginchi/Projects/tradelovin` 做生产结论或合并。

---

**文档维护：** 重大状态变化（#21 合并、三卡上线、新 P0）时更新本文件日期与 §2。
