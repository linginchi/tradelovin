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

[`wrangler.jsonc`](wrangler.jsonc) 中已配置 `routes` 指向 `tradelovin.com/*`（`custom_domain: true`）。首次绑定仍需在 **Cloudflare Dashboard** 中完成 DNS 与路由生效（以控制台提示为准）。

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

## 6. 可选：静态资源绝对前缀

默认 **不要** 在 `next.config` 里写死 `https://...workers.dev` 作为 `assetPrefix`。若将来使用独立 CDN，可在构建/部署环境设置环境变量 **`ASSET_PREFIX`**（见 [`next.config.ts`](next.config.ts)）。

---

## 7. 类型文件

配置变更后请执行：

```bash
npm run cf-typegen
```

会依据 [`wrangler.jsonc`](wrangler.jsonc) 更新 [`cloudflare-env.d.ts`](cloudflare-env.d.ts)。
