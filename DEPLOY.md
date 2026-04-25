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

## 2. 部署命令

```bash
npm run deploy:cloudflare
```

等价于：先 `npm run build:cloudflare`，再 `wrangler deploy`（使用根目录 [`wrangler.jsonc`](wrangler.jsonc)）。

部署后默认 Workers 子域示例：`https://tradelovin.<account>.workers.dev`（以你账号实际域名为准）。

---

## 3. 自定义域名（`tradelovin.com`）

[`wrangler.jsonc`](wrangler.jsonc) 中已配置 `routes` 指向 `tradelovin.com/*`（`custom_domain: true`）。首次绑定仍需在 **Cloudflare Dashboard** 中完成 DNS 与路由生效（以控制台提示为准）。

### 与 Pages 的切换（domain-cutover）

1. 打开 **Workers & Pages** → 原 **Pages** 项目 `tradelovin`。
2. **自定义域**：从该 Pages 项目移除 **`tradelovin.com`**（以及不打算再给 Pages 用的主机名），避免与 Worker 路由争抢。
3. 打开 **Workers** → 脚本 `tradelovin`（或你部署后的 Worker 名称）→ **自定义域 / 触发器**，按引导将 **`tradelovin.com`** 绑定到该 Worker。
4. 等待 DNS/证书生效后，用浏览器与 `curl` 验证 `https://tradelovin.com` 与 `https://www.tradelovin.com`（若使用）均返回 200。

---

## 4. 验证 Worker 正常后再处理 Pages（verify-delete-pages）

1. 确认 `workers.dev` 子域与 **`tradelovin.com`** 访问均为 **200**，且无 `ChunkLoadError` 等（可用 `npx wrangler tail tradelovin` 看实时日志）。
2. 在 Pages 项目内 **停止自动部署**（或断开 Git 连接），避免误发旧版静态站。
3. 确认 **不再需要** `*.pages.dev` 预览后，可 **删除** Pages 项目（可先在设置里重命名/停用观察一段时间）。

**注意**：删除 Pages 不会删除你的 Git 仓库，仅删除 Cloudflare 上的 Pages 应用与相关构建配置。

---

## 5. 可选：静态资源绝对前缀

默认 **不要** 在 `next.config` 里写死 `https://...workers.dev` 作为 `assetPrefix`。若将来使用独立 CDN，可在构建/部署环境设置环境变量 **`ASSET_PREFIX`**（见 [`next.config.ts`](next.config.ts)）。

---

## 6. 类型文件

配置变更后请执行：

```bash
npm run cf-typegen
```

会依据 [`wrangler.jsonc`](wrangler.jsonc) 更新 [`cloudflare-env.d.ts`](cloudflare-env.d.ts)。
