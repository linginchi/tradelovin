# 产品交接：豹仔学堂 / Leo Learns to Trade

**交接日期：** 2026-07-24  
**交接对象：** 产品经理  
**后续协作方式：** 产品经理负责问题定义、优先级、验收标准与上线决策；架构/开发工程师负责技术方案、实现、测试、部署与风险说明。

---

## 1. 当前产品定位

豹仔学堂是一个**交易训练与量化投资实验的学习平台**，不是券商、投顾或实盘交易平台。

对外统一叙事：

> 基础课程（线上）+ 高阶导师亲授课程（线下）+ 执行练习 + 量化投研实验。不荐股、无实盘。

当前有两条训练产品线：

1. **TO交易训练**：模拟撮合、下单练习、纪律与挑战、TQ 评分，训练执行能力。
2. **AI量化实验室**：组合/持仓截图的去标的化风险结构教学诊断，训练研究与归因能力。

首页当前四个入口：

1. 订阅视频
2. TO交易训练
3. AI量化实验室
4. 豹仔课堂

---

## 2. 已交付状态

### 2.1 主站产品与导航

- 首页、顶部导航、手机菜单、页脚已增加 **AI量化实验室** 入口。
- TO交易训练和 AI量化实验室已统一为同级视觉样式。
- 交易训练页与实验室入口页均加入相互跳转和「做什么 / 不做什么」叙事。
- 已增加 `/lab` 受保护路由；未登录用户进入后会在登录完成后回到原路径。

主要实现位置：

- `src/app/[locale]/page.tsx`
- `src/components/shared/SiteTopBar.tsx`
- `src/components/shared/SiteFooter.tsx`
- `src/components/trade/TradeV2PageClient.tsx`
- `src/app/[locale]/(dashboard)/lab/page.tsx`
- `src/components/lab/LabEntryClient.tsx`

### 2.2 会员门禁

- 新增 `lab_access` 权限。
- 当前规则：**T2 / P2（云豹）及以上且会员 active** 才可进入实验室。
- 低等级会员可见实验室说明与升级入口，但无法签发实验室 SSO。

主要实现位置：

- `src/lib/membership/types.ts`
- `src/lib/membership/v2.ts`
- `src/lib/membership/guard.ts`

### 2.3 AI量化实验室主站能力

主站端已完成以下 P0 基础设施：

- `/lab` 入口页、会员门禁、诊断历史列表。
- 一次性授权码 SSO：主站签发 code，实验室服务端兑换短期 session。
- 实验室回调写入诊断结果与历史记录。
- Zod 结构化报告校验与合规过滤：
  - 禁止股票代码、标的名称和买卖指令进入用户可见报告。
  - 报告只保留行业暴露、集中度、风险主题和教学问题。
- 管理后台可查看模型健康状态，并在 **Gemini / GLM** 间切换已配置且支持视觉输入的模型。
- 模型 API Key 不存主站、不写入 Supabase。

主要实现位置：

- `src/app/api/lab/sso/route.ts`
- `src/app/api/lab/sso/exchange/route.ts`
- `src/app/api/lab/session/route.ts`
- `src/app/api/lab/active-model/route.ts`
- `src/app/api/admin/lab-config/route.ts`
- `src/app/api/admin/lab-models/route.ts`
- `src/lib/lab/report-schema.ts`
- `src/lib/lab/compliance-filter.ts`
- `src/lib/lab/sso.ts`
- `src/components/admin/AdminLabConfigPanel.tsx`

### 2.4 数据库

实验室迁移已准备。此前工作记录显示生产 Supabase 已应用并核验三张表；下一位工程负责人在继续实验室工作前，应先按验收 SQL 再次确认：

- `lab_sessions`：诊断历史与审计字段。
- `lab_config`：当前 provider / model 等非敏感配置。
- `lab_sso_codes`：一次性 SSO 授权码。

迁移文件：

- `supabase/migrations/20260724140000_lab_research.sql`

### 2.5 域名与登录回跳

**生产主域名已统一为：** `https://leolearnstotrade.com`  
**旧域名：** `https://tradelovin.com` 保留并 308 跳转至新主域名，保留原路径与 query 参数。

已完成：

- Worker 变量 `NEXT_PUBLIC_APP_URL` 已改为新主域名。
- Worker Secret `APP_ORIGIN` 与 `MAGIC_LINK_ORIGIN` 已设置为新主域名。
- 邮箱登录链接生成逻辑的默认 fallback 已改为新主域名。
- Worker middleware 已执行旧域名规范化跳转。
- 已部署 Worker 新版本并验证：
  - 新主域首页包含四个入口。
  - `tradelovin.com/lab?...` 会跳转到 `leolearnstotrade.com/lab?...`。

相关文件：

- `wrangler.jsonc`
- `src/middleware.ts`
- `src/app/api/auth/send-login-link/route.ts`
- `DEPLOY.md`

---

## 3. 尚未完成或需外部配置的事项

### P0 必须完成：实验室 VPS / Dojo 接通

主站已准备好，但独立实验室尚未接入生产 VPS。因此目前用户点击「进入实验室」会提示服务未配置，这是预期行为。

需要完成：

1. 在 VPS 部署并锁定 DojoAgents 版本，或确认使用轻量 FastAPI + Gemini 的替代实现。
2. 配置 Gemini API Key；GLM 仅作后备可选项。
3. 实现/适配：
   - `/sso/callback?code=`
   - `/health/models`
   - 调用主站 `/api/lab/sso/exchange`
   - 调用主站 `/api/lab/session`
   - 拉取主站 `/api/lab/active-model`
4. 为实验室设置 `LAB_PUBLIC_BASE_URL`，例如 `https://lab.leolearnstotrade.com`。
5. 用 T2+ 与低等级账号完成端到端验收。

部署说明：`docs/lab/dojo-vps-runbook.md`

### 外部认证配置

为确保 Google 登录在新域名正常工作，需要在 **Supabase Dashboard → Authentication → URL Configuration** 更新：

- `Site URL`：`https://leolearnstotrade.com`
- `Redirect URLs` 至少增加：
  - `https://leolearnstotrade.com/auth/callback`
  - 如启用 www，再加入 `https://www.leolearnstotrade.com/auth/callback`

旧域回调地址可在观察期内暂时保留。邮箱魔法链接已改走新域名。

### 其他外部配置待核对

- GitHub Actions Variable：`TQ_CRON_BASE_URL` 应改为 `https://leolearnstotrade.com`。
- Stripe Dashboard：Webhook 与成功/取消回跳应以新主域名为准。
- Cloudflare：确认 `leolearnstotrade.com`、必要时 `www.leolearnstotrade.com` 均绑定当前 Worker。
- 如切换发信域，再更新 `RESEND_FROM_EMAIL`；当前 `noreply@tradelovin.com` 仍可继续使用。

---

## 4. 尚待统一的产品文案

当前双入口的功能命名已更新，但全站品牌与会员等级仍有局部历史文案，产品经理应确定一次性统一规则后安排清理：

- 首页 badge、页脚及部分元数据仍写「豹仔乐园」，而交易/实验室页写「豹仔学堂」。
- 实验室门禁文案混用「T2/T3」与「P2 · 云豹」。
- 实验室设计文档中的旧名称为「AI研究实验室」和「T0训练盘」，当前 UI 名称为「AI量化实验室」和「TO交易训练」。

建议统一后的对外名称：

- 品牌：豹仔学堂
- 执行入口：TO交易训练
- 研究入口：AI量化实验室
- 会员等级：选择一套对外展示体系后，全站一次性替换；当前不要在同一页面混用 T 与 P。

---

## 5. 产品验收清单

### 域名与登录

- [x] 访客访问新主域首页可看到四入口。
- [x] 旧域访问任意路径跳转到新主域同路径。
- [ ] 使用真实邮箱完成一次魔法链接登录，确认登录后仍在新主域。
- [ ] 使用 Google 登录完成一次回调验收（完成 Supabase 白名单后）。

### AI量化实验室主站

- [ ] T1 / 试用账号打开 `/lab`，显示升级引导且无法进入。
- [ ] T2+ 账号打开 `/lab`，显示进入实验室按钮。
- [ ] T2+ 签发 SSO code 后，code 仅能兑换一次。
- [ ] 后台 `/cjkzt/lab` 可加载模型健康状态。

### AI量化实验室端到端

- [ ] VPS 接通后，T2+ 能从主站免登进入实验室。
- [ ] 上传截图后，报告不包含股票代码、股票名称、买卖指令。
- [ ] 诊断历史可回写并在 `/lab` 显示。
- [ ] provider/model 切换只影响新诊断，历史记录保留实际模型。

完整操作说明：`docs/lab/main-site-acceptance.md`

---

## 6. 合规与产品边界

以下边界不可因增长或体验需求被绕开：

- 不荐股、不提供买卖建议。
- 不连接实盘、不管理真实资产。
- AI 输出必须去标的化，不能展示具体股票标识或交易指令。
- 用户上传截图前必须明确提醒：不要包含个人身份信息。
- API Key 仅保留在实验室 VPS / Secret 管理中，不能进入前端、主站数据库或后台界面。

---

## 7. 当前工程状态、技术债与交接注意事项

- 当前分支：`main`。
- 实验室、品牌叙事、域名修复相关代码目前仍有未提交变更；下一位工程负责人提交前应审阅完整 diff，避免把无关改动混入提交。
- 最新 Worker 已部署，版本以 Cloudflare 生产部署记录为准；本地 Git 未提交不等于生产未生效。
- 本次生产构建已通过 TypeScript；域名修复相关文件已通过 ESLint。
- 构建存在 Next.js 的 `middleware` → `proxy` 迁移提示，以及 OpenNext 打包依赖的重复 object-key 警告；二者均未阻止本次部署，但应在独立技术债任务中评估。
- 实验室的当前合规层为「结构化 schema + 正则过滤」；设计中的 LLM 语义二审尚未实现，灰度前应加入人工抽检流程。
- 实验室回调写库目前依赖 Dojo 服务端密钥，未二次复核会员状态；端到端上线前应评估是否补充该校验。
- 一次性 SSO code 的过期记录暂无清理任务；上线后需增加定期清理。
- 实验室尚未覆盖自动化测试，至少应补 SSO 单次消费、会员门禁和合规拦截的回归测试。

---

## 8. 建议的产品优先级

1. **P0：完成新域名真实登录验收**  
   更新 Supabase OAuth 白名单，分别验证邮箱与 Google 登录。
2. **P0：完成实验室 VPS Spike**  
   验证 DojoAgents + Gemini 是否满足截图诊断、SSO、结构化输出和合规过滤要求。
3. **P0：实验室端到端灰度**  
   先向少量 T2+ 账号开放，检查输出合规、单次成本、错误率与人工抽检。
4. **P1：研究复盘**  
   基于用户诊断历史增加研究问题、归因与复盘模板。
5. **P2：教学组合跟踪**  
   仅做教学模拟组合与研究追踪，不接实盘。

---

## 9. 产品经理与工程角色边界

产品经理负责：

- 定义目标用户、场景、需求优先级与可量化验收标准。
- 决定灰度范围、会员策略、内容审核策略与上线节奏。
- 审核对外叙事、课程与实验室的教学边界。

架构 / 开发工程师负责：

- 评估方案可行性、数据流、认证安全、合规机制与运维成本。
- 将已确认需求拆解为技术方案、接口、数据模型、测试与部署步骤。
- 实现、验证、上线、监控，并明确技术风险与阻塞项。
