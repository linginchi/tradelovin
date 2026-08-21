# Handoff：Windows → MacBook Pro（AI量化实验室 · VPS 接通）

**日期：** 2026-08-21  
**远程：** `https://github.com/linginchi/tradelovin.git`  
**分支：** `main`  
**生产：** https://leolearnstotrade.com · 内地入口 https://xeoaxis.com  
**实验室 URL（目标）：** https://lab.xeoaxis.com  
**Supabase：** `bpuqqyqmrtchaqfouygm`（**禁止改** `NEXT_PUBLIC_SUPABASE_URL`）

本文给 **MacBook Pro** 在 Cursor 中接续。先 `git pull`，再读本文 §3「明天第一件事」。

---

## 0. Mac 上对齐代码

```bash
cd ~/Projects/tradelovin   # 或你的 clone 路径
git checkout main
git pull origin main
npm ci
npx wrangler login          # 若需改 Worker 变量 / secret
```

密钥不进 git。本地 `.env.local` 需自行准备（与生产一致；见 [`docs/lab/env.sample`](../lab/env.sample)）。

---

## 1. 本会话已决策（勿推翻）

| 决策 | 内容 |
|------|------|
| 实验室公网域 | **`lab.xeoaxis.com`**（内地用户 SSO 跳转用；非 `leolearnstotrade.com`） |
| VPS | 与 xeoaxis **同机**：阿里云香港轻量 `47.238.133.111`，Ubuntu 24.04，2 vCPU / ~1.6–2 GiB RAM |
| 备案 | **P0 跑通后再做**；可另立大陆备案站，届时只改 `LAB_PUBLIC_BASE_URL` |
| 产品边界 | 月结单/收益数据、策略分析 + TQ 评分（P1+）；**不提供投资建议/荐股**；P0 仍是截图诊断 Spike |
| magic link | **勿动** xeoaxis Nginx 反代 Worker；实验室 **只新增** `lab-xeoaxis` 站点 |
| DNS | **生效在 Cloudflare**（NS：`marissa` / `ignacio.ns.cloudflare.com`）。阿里云解析面板里的记录 **未接 NS，不生效**；已在 Cloudflare 加 **A `lab` → 47.238.133.111（灰云）** |

---

## 2. VPS 上已完成 / 未完成

### 已完成（2026-08-21 网页终端）

| 项 | 状态 |
|----|------|
| xeoaxis 主站 | `curl -sI https://xeoaxis.com` → **200**，Nginx `sites-enabled/tradelovin` **勿改** |
| DNS（服务器侧） | `xeoaxis.com`、`lab.xeoaxis.com` → `47.238.133.111` |
| swap | **2 GiB** `/swapfile` 已启用 |
| `/opt/lab` | 目录已建；**`lab_stub.py` 曾误贴占位符**，需按 §3 步骤 1 重写 |

### 未完成（Mac 接手后做）

| 步 | 内容 |
|----|------|
| 1 | 部署正确 [`ops/lab-vps/lab_stub.py`](../ops/lab-vps/lab_stub.py) 到 `/opt/lab/` |
| 2 | `/opt/lab/.env` 填入 `LAB_DOJO_SERVER_KEY`（与 Worker **完全一致**） |
| 3 | `systemd` 服务 `lab-stub` 启动并 `active` |
| 4 | Nginx **`lab-xeoaxis`** + `certbot` 仅 `lab.xeoaxis.com` |
| 5 | Worker 设 **`LAB_PUBLIC_BASE_URL=https://lab.xeoaxis.com`**（Plain var，非 Secret） |
| 6 | `npm run spike:lab:check`（Gate E）；Gate A–D 见 [`docs/lab/spike-protocol.md`](../lab/spike-protocol.md) |
| 7 | 配置 `ARK_API_KEY`（仅 VPS）后跑 Gate B–C |

SSH：用户选 **阿里云网页终端粘贴命令**；`admin@iZj6cce3q9lcy8rjrvab4gZ`，SSH 公钥登录未配（`Permission denied`）。

---

## 3. 明天第一件事（Mac 操作顺序）

### 3.1 解决 `LAB_DOJO_SERVER_KEY`（Cloudflare **看不到**已存 Secret 明文）

在 Mac 项目根目录：

```bash
openssl rand -hex 32
npx wrangler secret put LAB_DOJO_SERVER_KEY   # 粘贴上一步输出
```

**同一值**写入 VPS `/opt/lab/.env` 的 `LAB_DOJO_SERVER_KEY=`。

> `LAB_SSO_SECRET` 仅 Worker 需要；VPS stub **不要**写进 `.env`（除非后续自研 worker 要签 JWT）。

### 3.2 VPS：安装 stub + systemd

仓库已含脚本与程序：

- [`ops/lab-vps/lab_stub.py`](../ops/lab-vps/lab_stub.py)
- [`ops/lab-vps/install-lab-stub.sh`](../ops/lab-vps/install-lab-stub.sh)

网页终端可 scp 不便时，继续用 **heredoc 粘贴** `lab_stub.py`（见上一会话 Cursor 聊天记录，或从 Mac 本地文件 `cat` 后粘贴）。

`.env` 模板：

```bash
LAB_DOJO_SERVER_KEY=<与 Worker 相同>
MAIN_APP_BASE_URL=https://leolearnstotrade.com
LAB_PUBLIC_BASE_URL=https://lab.xeoaxis.com
ARK_API_KEY=
LAB_VOLCANO_MODEL_ID=pending-spike
```

验证：

```bash
sudo systemctl restart lab-stub
curl -sS http://127.0.0.1:8765/
source /opt/lab/.env
curl -sS -H "Authorization: Bearer $LAB_DOJO_SERVER_KEY" http://127.0.0.1:8765/health/models
```

未配 `ARK_API_KEY` 时 `configured:false` **属预期**。

### 3.3 VPS：Nginx + TLS（不动 tradelovin）

```bash
# 或上传仓库后：
# bash ops/mainland-access/setup-lab-proxy.sh lab.xeoaxis.com 8765 admin@xeoaxis.com
```

手动等价：`/etc/nginx/sites-available/lab-xeoaxis` → `proxy_pass http://127.0.0.1:8765` → `certbot --nginx -d lab.xeoaxis.com`。

验收：

```bash
curl -sI https://lab.xeoaxis.com/ | head -3
curl -sI https://xeoaxis.com/ | head -3   # 仍须 200
```

### 3.4 Worker 变量

Dashboard：**Workers → tradelovin → Settings → Variables and Secrets → Variables**  
新增 Plain text：`LAB_PUBLIC_BASE_URL` = `https://lab.xeoaxis.com`

或（需已 `wrangler login`）在 `wrangler.jsonc` 的 `vars` 增加同名项后部署——**仅改变量时优先 Dashboard，免全量 deploy**。

### 3.5 端到端 smoke

1. T2+ 账号登录 https://xeoaxis.com/lab → 点「进入实验室」→ 应跳转 `https://lab.xeoaxis.com/sso/callback?code=...` → 见「SSO 成功」页  
2. Mac 本地：

```bash
export LAB_PUBLIC_BASE_URL=https://lab.xeoaxis.com
export LAB_DOJO_SERVER_KEY='***'
npm run spike:lab:check
```

---

## 4. 仓库新增文件（本次 push）

| 路径 | 用途 |
|------|------|
| [`ops/lab-vps/lab_stub.py`](../ops/lab-vps/lab_stub.py) | Gate D/E 最小 HTTP stub（Spike 前基础设施） |
| [`ops/lab-vps/install-lab-stub.sh`](../ops/lab-vps/install-lab-stub.sh) | swap + systemd 安装 |
| [`ops/mainland-access/nginx-lab.conf.template`](../ops/mainland-access/nginx-lab.conf.template) | lab 子域 Nginx 模板 |
| [`ops/mainland-access/setup-lab-proxy.sh`](../ops/mainland-access/setup-lab-proxy.sh) | lab TLS 一键脚本（不碰 xeoaxis） |

Runbook 仍见 [`docs/lab/dojo-vps-runbook.md`](../lab/dojo-vps-runbook.md)（将示例 URL  mentally 换成 `lab.xeoaxis.com`）。

---

## 5. 主站 / Phase 0 状态（勿重复劳动）

- `main` @ Phase 0 volcano-only 已合并；`lab_config.active_model` = `{ provider: volcano, model_id: pending-spike }`
- Worker 已有 Secret：`LAB_SSO_SECRET`、`LAB_DOJO_SERVER_KEY`（**值不可读，可能需 rotate，见 §3.1**）
- **`LAB_PUBLIC_BASE_URL` 生产尚未配置** → `/lab`「进入实验室」仍 toast「服务尚未配置」（VPS HTTPS + Worker var 完成后解除）
- 未过 Spike **不得**宣称端到端诊断可用

测试：`npm run test:lab`（21/21 离线）；`npm run test:contracts:xeoaxis`。

---

## 6. Windows 工作区未提交 WIP（不在本次 push）

以下文件在 Windows 上有本地修改，**未纳入本 handoff commit**，Mac 拉 main 后默认没有：

- `src/app/api/resources/apply/route.ts` — 教练自申额度 `canOpenDesk` → `isCoach`
- `src/components/trade/TradeV2PageClient.tsx` — 教练 UI `selfIsCoach` 文案

若需延续：在 Windows 上 `git stash` 或单独 commit 后再 push；或在 Mac 上重做。

---

## 7. 硬约束（全程有效）

- 不改 magic-link-origin / xeoaxis 护栏 / `NEXT_PUBLIC_SUPABASE_URL`
- `ARK_API_KEY` 仅 VPS，不进 git / Supabase `lab_config`
- 用户可见报告去标的化；禁止买卖指令
- xeoaxis Nginx **`tradelovin`** 站点：**禁止修改**

---

## 8. 参考链接

| 文档 | 路径 |
|------|------|
| Spike Gate A–E | [`docs/lab/spike-protocol.md`](../lab/spike-protocol.md) |
| 主站验收 | [`docs/lab/main-site-acceptance.md`](../lab/main-site-acceptance.md) |
| xeoaxis 恢复 | [`ops/mainland-access/XEOAXIS_RECOVERY.md`](../ops/mainland-access/XEOAXIS_RECOVERY.md) |
| 上一版 Mac→Win handoff | [`docs/handoff-2026-08-21-windows-quant-dashboard.md`](./handoff-2026-08-21-windows-quant-dashboard.md) |
| P0 打印稿 | [`docs/quant-lab-p0-plan-print.md`](../quant-lab-p0-plan-print.md) |

---

**Mac 接手口令：** pull main → 读本文 §3 → 网页终端完成 VPS → `LAB_PUBLIC_BASE_URL` → `spike:lab:check` → Gate A（Dojo）或 Fallback。
