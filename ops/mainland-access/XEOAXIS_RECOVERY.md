# xeoaxis.com 恢复 Runbook

内地入口 `xeoaxis.com` 与海外入口共用同一 Cloudflare Worker。本 Runbook 用于区分**环境变量误配** vs **代码回归**，并选择最短恢复动作。

**原则：** 不自动 rollback；恢复为人工操作（`wrangler rollback` + env 检查清单）。

---

## A. 自检（约 5 分钟）

```bash
./ops/mainland-access/verify-mainland-proxy.sh xeoaxis.com <worker-host>
BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis
```

症状对照：

| 症状 | 优先查 |
|------|--------|
| 页面无样式 / 裸 HTML | `NEXT_ASSET_PREFIX`、构建产物 asset 前缀 |
| 登录邮件链到海外域 | magic-link 解析逻辑、是否未部署 Host 优先修复 |
| 打开 xeoaxis 整站跳海外 | middleware 旧域列表是否误含 xeoaxis |
| 登录/OAuth 回调失败 | Supabase Redirect URLs 是否仍含 xeoaxis |

---

## B. 环境变量类（不回滚代码）

- Actions Variable / 构建：`NEXT_ASSET_PREFIX` **清空**（必须为空；任何绝对 `http(s)://` 前缀都会被忽略并导致内地静态资源失败）。
- `MAGIC_LINK_ORIGIN` / `APP_ORIGIN` 可设为海外主域（供非 allowlist Host 回退）；**不得**依赖其覆盖 xeoaxis 请求——代码必须 Host 优先。
- Supabase Dashboard：Redirect URLs **保留** `https://xeoaxis.com/**` 与既有 callback 路径。
- 改完后重跑冒烟；若仅构建期变量变更，触发一次生产构建部署。

---

## C. 代码回归类（线上止血）

```bash
npx wrangler rollback --message "xeoaxis: restore previous Worker version"
# 或：npx wrangler rollback <VERSION_ID> --message "..."
```

说明：三入口共 Worker，回滚会使海外入口一并回到该版本——这是刻意的止血。修根因用 PR 前进，勿长期停在 rollback 版本上开发。

Cloudflare 允许回滚至近 100 个已发布版本；bindings 被删改时 rollback 可能被拒，此时按 B 修 env 或 cherry-pick 热修前进部署。

---

## D. 恢复后

- 再跑 `smoke:xeoaxis` 与海外主域 fingerprint/冒烟。
- 记录根因；若缺不变量覆盖，补一条契约测试后合入。

---

## 参考

- 多入口模型与护栏：[`docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md`](../../docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md)
- 主机名事实源：[`src/lib/site-entries.mjs`](../../src/lib/site-entries.mjs)
- 部署说明：[`DEPLOY.md`](../../DEPLOY.md) §6、§9
