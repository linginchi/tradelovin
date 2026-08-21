# 量化实验室 P0 整体规划

打印日期：2026-08-21
来源：Cursor Plan（量化实验室 P0 规划）
修订：Phase 0 提供商 volcano-only（分支 `feat/quant-lab-phase-0`）

---

## 1. 产品目标（P0 范围）

对外主名：AI量化实验室

核心能力：T2/T3 活跃会员 → 一键 SSO 进入实验室 → 上传组合截图 → 火山（volcano）多模态识别 → 去标的化诊断报告 → 主站 /lab 历史可见

提供商：**仅 `volcano`**。默认 `lab_config.active_model` = `{ "provider": "volcano", "model_id": "pending-spike" }`。真实 Doubao/Ark model id 由 Spike 锁定，勿臆造。无 Gemini / GLM 可选切换。

明确不做（MVP）：
- 荐股、买卖指令、实盘
- 研究复盘（P1）、教学组合跟踪（P2）
- 模块考核仪表盘（等 P0 端到端验收后再做）

会员门禁：lab_access = T2/T3 + active + 未过期；T1 显示升级 CTA，API 403

---

## 2. 系统架构（文字版）

[T2+ 学员] → [/lab 入口] → [POST /api/lab/sso 签发一次性 code]
  → [VPS /sso/callback] → [POST /api/lab/sso/exchange 兑换 session]
  → [VPS 截图上传 UI] → [火山 API 多模态（Path A 方舟 或 Path B 视觉智能，Spike 锁定）]
  → [主站 compliance-filter 合规过滤] → [POST /api/lab/session 落库]
  → [lab_sessions / lab_config / lab_sso_codes]

职责划分：

| 组件     | 职责                                   | 密钥                          |
|----------|----------------------------------------|-------------------------------|
| 主站     | 会员门禁、SSO、合规过滤、存储、后台切换 volcano model id | LAB_SSO_SECRET、LAB_DOJO_SERVER_KEY |
| VPS      | 截图 UI、多模态、教学 prompt、回调主站  | Path A `ARK_API_KEY` 或 Path B `VOLC_ACCESS_KEY` + `VOLC_SECRET_KEY`（仅 VPS，TBD） |
| Supabase | lab_sessions、lab_config、lab_sso_codes  | 无 API Key                    |

`/health/models` 恰好一个 volcano：`configured=true` 且 `visionCapable=true`。重复 volcano 形状失败；未知 id 忽略。

---

## 3. 交付阶段

| 阶段     | 内容                         | 状态               |
|----------|------------------------------|--------------------|
| Spike    | Gate A–E 验证 + 决策记录     | 未执行（无 Pass 证据） |
| P0-A     | 截图诊断端到端               | 阻塞于 Spike/VPS   |
| P0-B     | 后台 volcano model id 切换、限次、成本 | 切换 UI 已收敛为 volcano-only |
| P1+      | 研究复盘、教学组合跟踪       | 未开始             |
| 仪表盘   | T0 + 量化实验室 TQ 仪表      | 明确延后           |

Phase 0（本分支）：文档与主站收口对齐 volcano；迁移 `20260821041119_lab_volcano_provider.sql` 将 `active_model` 写成 pending-spike。未过 Spike 不得宣称端到端可用。

---

## 4. 主站实现状态（Task 0–7）

### 已完成
- Task 0：Spike 文档 + VPS runbook
- Task 1：DB 迁移（lab_sessions / lab_config / lab_sso_codes；原始 `20260724140000`）
- Task 2：会员 lab_access（T2/T3 active）
- Task 3：报告 schema + 合规过滤
- Task 4：SSO 签发/兑换
- Task 5：Session 列表/回写
- Task 6：/lab 入口 + 导航 + i18n
- Task 7：后台模型切换（/cjkzt/lab；仅 volcano）
- 测试：npm run test:lab（离线）

### Phase 0 进行中（`feat/quant-lab-phase-0`）
- 第二份迁移：`supabase/migrations/20260821041119_lab_volcano_provider.sql`（provider 收敛 + active_model pending-spike；须 apply 后远程才生效）
- 文案：AI量化实验室；Admin 侧栏 /trade 互链按 AI量化实验室
- 提醒规则 `.cursor/rules/quant-dashboard-engineering.mdc` 已删除（工程已开工）

### 小缺口（不依赖 VPS）
- 诊断历史无单条详情页
- P0-B 限次/配额 API 未实现

### 环境未知项
- 两份迁移是否已在远程 Supabase apply（需确认；第二份 apply 前 active_model 可能仍是旧 gemini）
- LAB_SSO_SECRET / LAB_DOJO_SERVER_KEY 是否已写入 Worker
- LAB_PUBLIC_BASE_URL 未配置 → 「服务尚未配置」（预期）
- 火山 Path A / Path B 密钥未进 VPS（预期；勿写入主站）

---

## 5. Spike Gate（P0 关键路径）

Spike 通过前不得宣称端到端可用。Gate A–E 当前全未勾选。

| Gate | 验证内容                              | 位置        | 自动化                    |
|------|---------------------------------------|-------------|---------------------------|
| A    | DojoAgents 自托管可运行               | VPS         | 手工                      |
| B    | 火山多模态截图识别                    | VPS         | 手工                      |
| C    | 去标的化 JSON + 合规拦截              | VPS + 主站  | 半自动（--report）        |
| D    | SSO 跳转 → exchange → session 回写    | 主站 + VPS  | 手工                      |
| E    | /health/models 恰好一个 volcano 且 configured+visionCapable | VPS         | npm run spike:lab:check   |

无 VPS 时：spike:lab:check 必须 fail closed（退出码 1）。

决策分叉：
- Gate A Fail → 自研 lab-worker + volcano SDK（Fallback）
- Gate B–E 任一 Fail → Fallback
- 全部 Pass → 继续 Dojo 路径
- Fallback 保持主站 SSO / health / session 接口形状不变（非 Gemini）

---

## 6. 推荐执行顺序

Phase 0 — 主站收尾（进行中，`feat/quant-lab-phase-0`）
  1. 文档与代码对齐 volcano-only
  2. apply 两份迁移（`20260724140000` + `20260821041119`）
  3. 按 main-site-acceptance.md 跑主站冒烟
  4. 确认远程 DB 三表 + active_model = pending-spike

Phase 1 — 环境配置
  openssl rand -hex 32  # LAB_SSO_SECRET
  openssl rand -hex 32  # LAB_DOJO_SERVER_KEY
  （主站 Worker + VPS 必须一致；火山密钥仅 VPS：Path A `ARK_API_KEY` 或 Path B `VOLC_ACCESS_KEY` + `VOLC_SECRET_KEY`）

Phase 2 — Spike Gate A–E（需 VPS + 火山密钥；路径 TBD）

Phase 3 — 端到端联调（T2+ 完整路径）

Phase 4 — P0 验收 + 部署（DEPLOY.md §2）

延后：模块考核仪表盘

---

## 7. P0 验收标准

[ ] T2+ 一键进实验室并免登（auth-code SSO）
[ ] 上传截图返回结构化去标的化诊断
[ ] 合规抽检：0 个股代码 / 买卖指令
[ ] lab_sessions 含 model / provider / tokens / cost（provider = volcano）
[ ] T1 及以下被拦截
[ ] 后台仅可切换至健康检查列出的 volcano model id

---

## 8. 硬约束

- 不改 NEXT_PUBLIC_SUPABASE_URL（bpuqqyqmrtchaqfouygm.supabase.co）
- 不改 magic-link-origin.mjs Host 优先逻辑
- 火山 / Dojo API Key 只放 VPS，不进 lab_config、不进 git
- 用户可见报告必须去标的化
- Spike 未通过前不得宣称「端到端可用」
- 勿臆造真实 Doubao/Ark model id

---

## 9. 明确延后

模块考核仪表盘：T0 + 量化实验室各一块 TQ 仪表；触发条件为 P0 能产出真实去标的化诊断报告之后。

---

## 10. 待办清单

[ ] Phase 0：volcano 文档/迁移/主站收口（本分支）
[ ] 生成并配置 LAB_SSO_SECRET / LAB_DOJO_SERVER_KEY
[ ] 主站冒烟验收（AI量化实验室文案、session provider=volcano、admin volcano/pending-spike）
[ ] VPS Spike Gate A–E
[ ] 决定 Dojo 或 lab-worker + volcano Fallback
[ ] T2+ 端到端联调
[ ] P0 验收 + 部署 + 更新 handoff
[ ] 【延后】模块考核仪表盘

---

## 11. 关键文档索引

- docs/handoff-2026-08-21-windows-quant-dashboard.md
- docs/superpowers/specs/2026-07-24-ai-research-lab-design.md
- docs/superpowers/plans/2026-07-24-ai-research-lab.md
- docs/lab/main-site-acceptance.md
- docs/lab/spike-protocol.md
- docs/lab/spike-checklist.md
