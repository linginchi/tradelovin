# TradeLovin · Cloudflare 部署收敛说明

本项目使用 **OpenNext（`@opennextjs/cloudflare`）+ Cloudflare Workers**，**不要**再用 **Cloudflare Pages** 的「纯静态输出目录」方式托管全栈 Next。

若 Dashboard 里同时存在同名的 **Pages 项目** 与 **Workers 脚本**，一般不会在代码层「自动冲突」，但会导致：

- **自定义域名**可能仍指向 Pages，而不是新部署的 Worker；
- **Git 自动构建**可能继续推 Pages，与本地/CI 的 Workers 部署不一致；
- **环境变量**在两处分别配置，难以排查。

推荐只保留 **Workers** 作为生产入口，并按下面步骤完成迁移。

---

## 1. 生产构建：优先 Linux / CI

OpenNext 在 **Windows** 上可能产生与 edge 运行时相关的差异（官方会提示尽量用 WSL/Linux）。建议：

- **本地**：在 **WSL2（Ubuntu）** 中克隆仓库，执行 `npm ci` 与 `npm run build:cloudflare`。
- **CI**：仓库已提供 [`.github/workflows/opennext-build.yml`](.github/workflows/opennext-build.yml)，在 **ubuntu-latest** 上跑 `npm run build:cloudflare`。在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中配置 **`CLOUDFLARE_API_TOKEN`**（需具备 Workers 等部署权限的 API 令牌）后，**推送到 `main` 的分支**会在构建成功后继续执行 `npm run deploy:cloudflare`；未配置时部署步骤会认证失败。向仓库提交的 **Pull Request** 只构建、不部署。

---

## 2. Agent / 本地部署：必做检查清单（含 Windows）

**Cursor / 自动化 Agent 在本机执行 Cloudflare 部署时，必须先读本节再跑命令**，避免在目录被占用时反复重试。

### 2.1 标准命令（唯一推荐入口）

```bash
npm run deploy:cloudflare
```

等价关系与细节见下文 **§3 部署命令**（`build:cloudflare` → `wrangler deploy`，使用根目录 [`wrangler.jsonc`](wrangler.jsonc)）。

### 2.2 部署前必须释放占用（Windows 关键）

构建前会运行 [`scripts/clean-open-next.mjs`](scripts/clean-open-next.mjs)，且 OpenNext 内部也会清理/写入 **`.open-next`**。若以下任一情况存在，常见报错为 **`EBUSY` / `EPERM`**（无法删除 `.open-next\assets` 等）：

- 本机正在跑 **`next dev`** / **`opennextjs-cloudflare preview`** / **`wrangler dev`** 等；
- **资源管理器**打开了 **`.open-next`** 文件夹；
- 杀毒或同步软件长时间锁定该目录。

**在未确认释放占用前，不要反复执行部署**。

**诊断（PowerShell，将 `$root` 换成你的项目根绝对路径）**：

```powershell
$root = "C:\projects\tradelovin"
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*$root*" } |
  Select-Object ProcessId, CommandLine
```

根据输出确认 **PID** 属于 **`next ... dev`**、**`wrangler`** 或本项目子进程后，再结束进程：

```powershell
Stop-Process -Id <PID> -Force
```

**禁止**使用无差别的 `taskkill /IM node.exe` / 结束全部 `node`，以免误伤 **Cursor**、其他项目或系统工具。

占用解除后，若 `.open-next` 仍存在，可在项目根执行：

```powershell
Remove-Item -Recurse -Force .open-next
```

然后再运行 **`npm run deploy:cloudflare`**。

### 2.3 认证

- **本地 CLI**：需已执行 **`npx wrangler login`**（或等效认证方式），或环境中提供具备 Workers 部署权限的配置。
- **CI**：在仓库 Actions Secret 中配置 `CLOUDFLARE_API_TOKEN`（与 §1 一致）。

### 2.4 成功判据与常见告警

- **成功**：进程退出码 **0**；日志中出现 **Uploaded** / **Deployed** 以及 **`*.workers.dev`** URL。
- **告警（非必然失败）**：若 `wrangler deploy` 提示 **本地 `wrangler.jsonc` 与 Dashboard 中该 Worker 的远程路由/自定义域配置不一致**、部署将覆盖远程配置，应提醒维护者核对 **自定义域** 与 **Workers 触发器**，不要仅凭 WARNING 误判为部署失败。

### 2.6 用户数据边界（IDOR）冒烟检查

上线前建议至少跑一次用户隔离冒烟（两组不同用户 cookie）：

```bash
BASE_URL=http://localhost:3000 USER_A_COOKIE="<cookie-a>" USER_B_COOKIE="<cookie-b>" node scripts/security/idor-smoke.mjs
```

脚本位置：[`scripts/security/idor-smoke.mjs`](scripts/security/idor-smoke.mjs)  
若任一接口返回两用户可疑“同形同内容”结果，会以非 0 退出。

### 2.5 优先策略

生产与可重复构建仍以 **Linux CI / WSL**（§1）为先。仅在需要本机 Wrangler 发布时走 Windows，且 **必须** 完成 §2.2 的占用排查。

---

## 3. 部署命令

```bash
npm run deploy:cloudflare
```

等价于：先 `npm run build:cloudflare`，再 `wrangler deploy`（使用根目录 [`wrangler.jsonc`](wrangler.jsonc)）。

部署后默认 Workers 子域示例：`https://tradelovin.<account>.workers.dev`（以你账号实际域名为准）。

---

## 4. 自定义域名（`tradelovin.com`）

当前仓库内的 [`wrangler.jsonc`](wrangler.jsonc) **未提交 `routes`**；自定义域名路由由 **Cloudflare Dashboard** 托管（避免本地/测试分支误覆盖生产路由）。

首次绑定或变更仍需在 **Cloudflare Dashboard** 中完成 DNS 与路由生效（以控制台提示为准）。

### 与 Pages 的切换（domain-cutover）

1. 打开 **Workers & Pages** → 原 **Pages** 项目 `tradelovin`。
2. **自定义域**：从该 Pages 项目移除 **`tradelovin.com`**（以及不打算再给 Pages 用的主机名），避免与 Worker 路由争抢。
3. 打开 **Workers** → 脚本 `tradelovin`（或你部署后的 Worker 名称）→ **自定义域 / 触发器**，按引导将 **`tradelovin.com`** 绑定到该 Worker。
4. 等待 DNS/证书生效后，用浏览器与 `curl` 验证 `https://tradelovin.com` 与 `https://www.tradelovin.com`（若使用）均返回 200。

---

## 5. 验证 Worker 正常后再处理 Pages（verify-delete-pages）

1. 确认 `workers.dev` 子域与 **`tradelovin.com`** 访问均为 **200**，且无 `ChunkLoadError` 等（可用 `npx wrangler tail tradelovin` 看实时日志）。
2. 在 Pages 项目内 **停止自动部署**（或断开 Git 连接），避免误发旧版静态站。
3. 确认 **不再需要** `*.pages.dev` 预览后，可 **删除** Pages 项目（可先在设置里重命名/停用观察一段时间）。

**注意**：删除 Pages 不会删除你的 Git 仓库，仅删除 Cloudflare 上的 Pages 应用与相关构建配置。

---

## 6. 静态资源前缀 `assetPrefix`（仅 Cloudflare 构建）

[`next.config.ts`](next.config.ts) 仅在设置了 **`NEXT_ASSET_PREFIX`** 或 **`ASSET_PREFIX`**（二选一，无尾部斜杠）时才会启用 Next 的 `assetPrefix`。这样本地 `npm run dev` 会使用同源 `/_next/static`，避免页面「像纯 HTML、无 CSS」。

| 场景 | 是否设置 |
| --- | --- |
| 本地 `next dev` / `npm run build && npm start` | **不要** 设置 |
| `npm run build:cloudflare` / `deploy:cloudflare` | **建议** 设为当前 Worker 对外 URL，例如 `https://tradelovin.mark-377.workers.dev`（以你账号实际域名为准）；若将来用独立 CDN，则设为该 CDN 源站前缀 |

**本机发布 Workers 前（PowerShell 示例）：**

```powershell
$env:NEXT_ASSET_PREFIX = "https://tradelovin.mark-377.workers.dev"
npm run deploy:cloudflare
```

**GitHub Actions：** 在仓库 **Settings → Secrets and variables → Actions → Variables** 中配置 **`NEXT_ASSET_PREFIX`**（与上面同源 URL 一致），工作流已将该变量注入 **`OpenNext` 构建步骤**。未配置时构建产物使用相对路径；若线上 Worker 强依赖绝对静态 URL，请务必配置该变量。

---

## 6.1 构建期变量 vs 运行期密钥（避免“CI 绿但线上 503”）

| 类别 | 变量 | 用途 | 建议配置位置 |
| --- | --- | --- | --- |
| 构建期（Next 打包） | `NEXT_PUBLIC_SUPABASE_URL` | 前端与服务端共享公开 Supabase URL | GitHub Actions Secrets / 本地 shell |
| 构建期（Next 打包） | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 前端匿名访问 key（公开） | GitHub Actions Secrets / 本地 shell |
| 构建期（可选） | `NEXT_ASSET_PREFIX` | 仅 Cloudflare 构建时设置静态资源绝对前缀 | GitHub Actions Variables / 部署命令前设置 |
| 运行期（Worker Secret） | `SUPABASE_SERVICE_ROLE_KEY` | 服务端 API 写库、后台管理、受保护流程 | Cloudflare Worker Secrets |
| 运行期（Worker Secret） | `ADMIN_JWT_SECRET` | 管理后台 JWT 签发与校验 | Cloudflare Worker Secrets |
| 运行期（Worker Secret） | `RESEND_API_KEY` | 邮件验证码与通知邮件 | Cloudflare Worker Secrets |
| 运行期（Worker Var/Secret） | `RESEND_FROM_EMAIL` | 发件人地址 | Cloudflare Worker Variables/Secrets |
| 运行期（Worker Var） | `ALLOW_FIXED_ADMIN_OTP` | 开启后台固定码登录（仅开发/测试建议） | Cloudflare Worker Variables / 本地 `.env` |
| 运行期（Worker Var） | `ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION` | 生产环境二次确认固定码（默认不启用） | Cloudflare Worker Variables |
| 构建期（Next 打包） | `NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS` | 前台显示开发/测试快捷登录入口（kk/william/mark） | 本地 `.env` / GitHub Actions Variables（不设时 workflow 默认 `0`） |
| 构建期（Next 打包） | `NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN` | `/cjkzt/login` 显示「一键登录（测试）」按钮（仍需 Worker 打开固定管理员 OTP） | 本地 `.env` / GitHub Actions Variables（不设时 workflow 默认 `0`） |
| 运行期（Worker Var） | `ENABLE_DEV_TEST_ACCOUNTS` | 启用 `/api/auth/dev-test-login`（固定测试账号入口） | Worker Variables（不设时 workflow 部署默认 `0`） |
| 运行期（Worker Var） | `ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION` | 生产环境二次确认 dev 测试账号入口（默认不启用） | Worker Variables（不设时 workflow 部署默认 `0`） |

### 6.2 GitHub Actions：推送到 `main` 自动部署 Workers（推荐路径）

- 工作流：[`.github/workflows/opennext-build.yml`](.github/workflows/opennext-build.yml)；向 **`main`** 推送且构建成功后会执行 `npx wrangler deploy`。
- 同一工作流已内置 **工作日 16:05（Asia/Hong_Kong）** 的定时任务（UTC `5 8 * * 1-5`），调用 `POST /api/tq/cron/recalculate`。
- **Secrets（Actions）**：`CLOUDFLARE_API_TOKEN`，以及用于 Next 打包的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- **Variables（Actions）**：建议配置 `NEXT_ASSET_PREFIX`（与当前 Worker 对外 URL 同源无尾斜杠，见上文「静态资源前缀」）。
- **TQ 定时重算必配项**：
  - Actions Secret：`TQ_CRON_API_KEY`（与 Worker 运行环境变量 `TQ_CRON_API_KEY` 保持一致）。
  - Actions Variable：`TQ_CRON_BASE_URL`（例如 `https://tradelovin.com`）。
  - 接口在服务端会二次判断：仅交易日且香港时间 16:00 后执行；非交易日或 16:00 前会返回 `skipped=true`。
- **重要**：不带 `--var` 的 `wrangler deploy` 会按本次发布覆盖 Worker 上对应 **vars**；此前仅用本地命令行注入的 `ALLOW_*` / `ENABLE_*` 可能在一次 CI 发布后被清空，表现为**后台固定码 / 前台测试登录「像退回老版本」**。当前工作流在部署步骤会**始终传入**下列变量（未在仓库 Variables 中设置时默认 `0`，安全默认关闭）：
  - `ALLOW_FIXED_ADMIN_OTP`
  - `ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION`
  - `ENABLE_DEV_TEST_ACCOUNTS`
  - `ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION`
- **构建期**（未在 Variables 中设置时 workflow 默认 `0`）：`NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS`、`NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN`。
- **生产门禁**：workflow 新增 `Production safety gate`。若上述 debug 登录相关开关在 `main` 部署时不是 `0/false`，会直接失败；确需临时放开时，可显式设置 `ALLOW_PROD_DEBUG_AUTH=1` 后再部署，并在完成后立即回收。
- **Pull Request**：只跑构建校验，不部署；合并进 `main` 后由推送触发部署。

> 说明：`quick-register` 已改为默认关闭，需显式设置 `ENABLE_QUICK_REGISTER=1` 才启用。
> 说明：后台固定码登录（`mark@hkfac.com + 123456`）仅在 `ALLOW_FIXED_ADMIN_OTP=1|true` 时可用；生产环境还需 `ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION=1|true`。
> 说明：前台快捷登录测试账号固定为 `kk / william / mark`（密码 `123456`），仅在 `NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS=1` 且 `ENABLE_DEV_TEST_ACCOUNTS=1` 时可用；生产环境还需 `ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION=1`。

### 6.3 线上数据库治理 SOP（membership / tq）

1. **冻结发布**：出现 `schema cache` / 缺表报错时，先暂停发布与环境变量变更。  
2. **应用迁移**：在生产项目执行 `supabase db push`，确保 `supabase/migrations` 全量落地。  
3. **刷新 schema cache**：在 Supabase Dashboard 等待或触发 PostgREST 刷新。  
4. **结构验收**：确认 `membership_accounts`、`membership_entitlements`、`tq_features`、`tq_scores`、`tq_config` 与相关索引存在。  
5. **关键 API 冒烟**：最少验证 `/api/membership/me`、`/api/trade/account`、`/api/tq/score`、`/api/tq/import-live`。  
6. **恢复放量**：全部通过再恢复正常发布；任一失败回到第 2 步，不依赖 fallback 放行。

可用仓库脚本（需要真实 cookie / cron key）：

```bash
BASE_URL="https://tradelovin.com" USER_COOKIE="<user-cookie>" TQ_CRON_API_KEY="<cron-key>" npm run smoke:api
```

Auth Magic Link 冒烟（指令113）：

```bash
BASE_URL="https://tradelovin.com" \
MAGIC_LINK_EMAIL="<可收件邮箱>" \
MAGIC_LINK_TOKEN="<从 email_login_tokens 表复制的 token>" \
MAGIC_LINK_NEXT="/my-learning" \
npm run smoke:auth-magic-link
```

脚本位置：[`scripts/deploy/auth-magic-link-smoke.mjs`](scripts/deploy/auth-magic-link-smoke.mjs)

说明：

- `MAGIC_LINK_TOKEN` 需使用刚发送且未消费、未过期（15 分钟内）的 token。
- 脚本会验证：
  - 发送登录链接接口可用；
  - 首次消费 token 成功并重定向；
  - 已建立 Supabase 会话 cookie 且 `/api/auth/me` 为登录态；
  - 同一 token 二次消费被拒绝（重定向到 `/login?error=invalid_link`）。
- 结构回滚迁移：[`supabase/migrations/20260514154500_email_login_tokens_rollback.sql`](supabase/migrations/20260514154500_email_login_tokens_rollback.sql)

### 6.4 交易执行文案单源同步（脚本/页面/API 一致）

交易执行文案以 `src/lib/trade/execution-messages.ts` 为源，脚本侧通过生成文件保持一致：

- 生成：`npm run sync:trade-execution-messages`
- 校验：`npm run verify:trade-execution-messages`

为防止漂移，以下命令已内置前置校验：

- `npm run smoke:trade-v2`
- `npm run verify:trade-v2-consistency`

若出现 drift 提示，先执行同步命令并提交 `scripts/shared/trade-execution-messages.mjs` 更新，再继续部署前验证流程。

### 6.5 生成文件统一入口（便于 CI/本地一致）

为避免后续新增生成文件时命令分散，仓库提供聚合入口：

- 同步全部生成文件：`npm run sync:generated`
- 校验全部生成文件：`npm run verify:generated`

建议在发布前验证链路中优先使用 `verify:generated`，再执行更重的 smoke/consistency。

---

## 7. 类型文件

配置变更后请执行：

```bash
npm run cf-typegen
```

会依据 [`wrangler.jsonc`](wrangler.jsonc) 更新 [`cloudflare-env.d.ts`](cloudflare-env.d.ts)。

---

## 8. Supabase：`registrations` 表与一键注册

前台 **一键注册（免邮箱）**（`/api/auth/quick-register`）与 **登录后报名**（`/api/enroll`）会向 `public.registrations` 写入 **`user_id`**（及 **`status`** 等）。  
注意：`quick-register` 现为 **默认关闭**，仅在设置 `ENABLE_QUICK_REGISTER=1` 时开启。  
若数据库仍停留在早期 [`supabase/registrations.sql`](supabase/registrations.sql)（仅有匿名插入、无 `user_id`），PostgREST 会报错例如：`Could not find the 'user_id' column of 'registrations' in the schema cache`。

**运维抄作业：** 详见 [`supabase/manual/APPLY_REGISTRATIONS_SCHEMA.md`](supabase/manual/APPLY_REGISTRATIONS_SCHEMA.md)（CLI 与 SQL Editor 逐步说明）。

**必做（与仓库迁移对齐）：**

1. 在项目根执行 **`supabase db push`**（或在你的 CI/运维流程中应用 [`supabase/migrations`](supabase/migrations) 下全部迁移）。
2. 若只能手动执行 SQL，至少按顺序覆盖：  
   [`20260430121800_registrations_status.sql`](supabase/migrations/20260430121800_registrations_status.sql)、  
   [`20260430122000_registrations_user_id_policies.sql`](supabase/migrations/20260430122000_registrations_user_id_policies.sql)，  
   以及幂等补丁 [`20260430124500_registrations_catchup_idempotent.sql`](supabase/migrations/20260430124500_registrations_catchup_idempotent.sql)（含 `auth.users` 邮箱回填 `user_id`、RLS 与 `user_id` 唯一索引）。
3. **讲师角色：** 若曾执行过仅允许 `user|admin|super_admin` 的 `profiles_role_check`，需应用 [`20260430126000_profiles_role_allow_instructor.sql`](supabase/migrations/20260430126000_profiles_role_allow_instructor.sql)，否则后台创建讲师会失败。
4. 执行后若错误仍存在：在 Supabase Dashboard 中 **重启/刷新 PostgREST** 或等待 schema cache 更新。

**环境变量：** 一键注册与匿名报名表单提交的 API（[`/api/registrations/public`](src/app/api/registrations/public/route.ts)）均依赖服务端 **`SUPABASE_SERVICE_ROLE_KEY`**；未配置时返回 503。

- **`ENABLE_QUICK_REGISTER`**：仅当设为 `true` 或 `1` 时，`POST /api/auth/quick-register` 才开启（默认关闭）。
- **`DISABLE_PUBLIC_REGISTRATION`**：设为 `true` 或 `1` 时，`POST /api/registrations/public` 返回 **403**。

**RLS 说明：** 收紧策略后，浏览器 **不可** 再以 anon 身份直接 `insert` `registrations`；匿名报名须走上述 **public API**（service role 写入）。

---

## 9. 内地测试入口（阿里云香港反向代理）

当 `tradelovin.com` 在内地网络存在访问不稳定或被拦截时，可临时提供一个 **阿里云香港域名入口** 供测试使用，保持现有 Workers 发布链路不变。

### 9.1 推荐拓扑

`Mainland User -> Aliyun HK Nginx -> tradelovin.<account>.workers.dev -> Supabase`

### 9.2 仓库内现成脚本

见 [`ops/mainland-access/README.md`](ops/mainland-access/README.md)，包含：

- Nginx 模板：[`ops/mainland-access/nginx-tradelovin.conf.template`](ops/mainland-access/nginx-tradelovin.conf.template)
- 一键部署：[`ops/mainland-access/setup-hk-proxy.sh`](ops/mainland-access/setup-hk-proxy.sh)
- 连通性验证：[`ops/mainland-access/verify-mainland-proxy.sh`](ops/mainland-access/verify-mainland-proxy.sh)

### 9.3 快速执行

先在阿里云 DNS 将新域名 `@`/`www` 的 `A` 记录指向香港服务器 IP，然后在服务器执行：

```bash
chmod +x setup-hk-proxy.sh verify-mainland-proxy.sh
./setup-hk-proxy.sh <your-domain.com> <worker-host>
./verify-mainland-proxy.sh <your-domain.com> <worker-host>
```

示例：

```bash
./setup-hk-proxy.sh tradelovin-hk.com tradelovin.mark-377.workers.dev
./verify-mainland-proxy.sh tradelovin-hk.com tradelovin.mark-377.workers.dev
```

### 9.4 注意事项

- 该方案适合“先让内地同事可测”，不等同于内地合规落地托管。
- 生产长期方案若需更稳定，建议评估“双入口架构”（内地入口 + 海外入口）与合规要求（备案/CDN）。
