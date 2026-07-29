# xeoaxis 入口固化护栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地多入口事实源、魔法链接 Host 优先、绝对 assetPrefix 拒绝、契约测试、CI 冒烟与恢复 Runbook，使海外切域无法再误伤 `xeoaxis.com`。

**Architecture:** 单一模块 `src/lib/site-entries.mjs` 定义三入口角色；magic-link / middleware / supabase client / assetPrefix 均引用它。CI 在 PR 跑契约测试，main 部署后对 `https://xeoaxis.com` 轻量冒烟；失败不自动 rollback，指向人工恢复文档。

**Tech Stack:** Next.js 16 / OpenNext Cloudflare Workers、Node.js `node:test` 契约测试、GitHub Actions、Wrangler rollback。

**Spec:** `docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md`

## Global Constraints

- 不拆内地独立 Worker；三入口共用同一 Worker。
- `xeoaxis.com` / `www.xeoaxis.com` 角色为 `mainland`：永不 308 到海外主域。
- 多入口下任何绝对 `http(s)://` 的 `NEXT_ASSET_PREFIX` / `ASSET_PREFIX` 必须忽略并回退相对路径。
- 魔法链接必须优先 allowlisted 请求 Host/Origin；`MAGIC_LINK_ORIGIN` 不得覆盖内地入口。
- 冒烟失败只标红 + 指向 Runbook，不自动 `wrangler rollback`。
- 本计划不含 Cloudflare DNS/自定义域控制台操作、Stripe/Supabase Dashboard 手工改 Site URL（仅在 Runbook/DEPLOY 中提醒保留 xeoaxis Redirect URLs）。

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/lib/site-entries.mjs` | 入口主机清单、角色、host 判定、legacy→canonical 目标 host |
| `src/lib/site-entries.mjs.d.ts` | TS 类型 |
| `src/lib/site/resolve-asset-prefix.mjs` | 可单测的 `resolveAssetPrefix` |
| `src/lib/auth/magic-link-origin.mjs` | 按请求 Host 解析魔法链接 base URL（allowlist 来自 site-entries） |
| `src/lib/auth/magic-link-origin.mjs.d.ts` | TS 类型 |
| `src/lib/site/legacy-overseas-redirect.mjs` | 纯函数：legacy 海外域是否应 308、目标 URL |
| `next.config.ts` | 改用 `resolve-asset-prefix.mjs` |
| `src/middleware.ts` | HTTPS 后缀与 legacy 海外 308 来自 site-entries / redirect helper |
| `src/app/api/auth/send-login-link/route.ts` | 使用 `resolveMagicLinkBaseUrl` |
| `src/lib/supabase/client.ts` | `isMainlandEntryHost` 决定 `/supabase-proxy` |
| `tests/lib/site-entries.contract.test.mjs` | T4 |
| `tests/lib/site/resolve-asset-prefix.contract.test.mjs` | T1 |
| `tests/lib/auth/magic-link-origin.contract.test.mjs` | T2 |
| `tests/lib/site/legacy-overseas-redirect.contract.test.mjs` | T3 纯函数 |
| `tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs` | T3 源码接线：middleware 调用 helper 且不含把 xeoaxis 当 legacy |
| `tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs` | workflow 含冒烟步骤 |
| `scripts/deploy/xeoaxis-entry-smoke.mjs` | 生产轻量冒烟 |
| `.cursor/rules/multi-entry-xeoaxis.mdc` | Agent 护栏 |
| `ops/mainland-access/XEOAXIS_RECOVERY.md` | 恢复 Runbook |
| `DEPLOY.md` | 链接 Runbook；更新多入口说明 |
| `.github/workflows/opennext-build.yml` | 契约测试步骤 + 部署后 xeoaxis 冒烟 |
| `package.json` | `test:contracts:xeoaxis`、`smoke:xeoaxis` |

---

### Task 1: `site-entries` 事实源 + T4 契约测试

**Files:**
- Create: `src/lib/site-entries.mjs`
- Create: `src/lib/site-entries.mjs.d.ts`
- Create: `tests/lib/site-entries.contract.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `SITE_ENTRIES: ReadonlyArray<{ hostname: string, role: "canonical" | "legacy_redirect" | "mainland" }>`
  - `CANONICAL_OVERSEAS_HOSTNAME: string` → `"leolearnstotrade.com"`
  - `MAINLAND_FALLBACK_ORIGIN: string` → `"https://xeoaxis.com"`
  - `normalizeHostname(host: string | null | undefined): string`
  - `isMainlandEntryHost(hostname: string | null | undefined): boolean`
  - `isLegacyOverseasHost(hostname: string | null | undefined): boolean`
  - `isCanonicalOverseasHost(hostname: string | null | undefined): boolean`
  - `isHttpsOnlyHost(hostname: string | null | undefined): boolean`（canonical / legacy / mainland 及其 www）
  - `getMagicLinkAllowedHosts(): string[]`（所有入口 hostname）

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/site-entries.contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
	SITE_ENTRIES,
	CANONICAL_OVERSEAS_HOSTNAME,
	isMainlandEntryHost,
	isLegacyOverseasHost,
	isCanonicalOverseasHost,
	getMagicLinkAllowedHosts,
} from "../../src/lib/site-entries.mjs";

test("xeoaxis is mainland and never legacy_redirect", () => {
	const xeo = SITE_ENTRIES.filter((e) => e.hostname === "xeoaxis.com" || e.hostname === "www.xeoaxis.com");
	assert.equal(xeo.length, 2);
	for (const e of xeo) assert.equal(e.role, "mainland");
	assert.equal(isMainlandEntryHost("xeoaxis.com"), true);
	assert.equal(isLegacyOverseasHost("xeoaxis.com"), false);
	assert.equal(isLegacyOverseasHost("www.xeoaxis.com"), false);
});

test("tradelovin is legacy_redirect; leolearnstotrade is canonical", () => {
	assert.equal(CANONICAL_OVERSEAS_HOSTNAME, "leolearnstotrade.com");
	assert.equal(isLegacyOverseasHost("tradelovin.com"), true);
	assert.equal(isLegacyOverseasHost("www.tradelovin.com"), true);
	assert.equal(isCanonicalOverseasHost("leolearnstotrade.com"), true);
	assert.equal(isCanonicalOverseasHost("www.leolearnstotrade.com"), true);
});

test("magic-link allowlist includes all entry hosts", () => {
	const hosts = getMagicLinkAllowedHosts();
	for (const name of [
		"xeoaxis.com",
		"www.xeoaxis.com",
		"tradelovin.com",
		"www.tradelovin.com",
		"leolearnstotrade.com",
		"www.leolearnstotrade.com",
	]) {
		assert.ok(hosts.includes(name), name);
	}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/site-entries.contract.test.mjs`  
Expected: FAIL（module missing）

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/site-entries.mjs
export const CANONICAL_OVERSEAS_HOSTNAME = "leolearnstotrade.com";
export const MAINLAND_FALLBACK_ORIGIN = "https://xeoaxis.com";

export const SITE_ENTRIES = Object.freeze([
	{ hostname: "leolearnstotrade.com", role: "canonical" },
	{ hostname: "www.leolearnstotrade.com", role: "canonical" },
	{ hostname: "tradelovin.com", role: "legacy_redirect" },
	{ hostname: "www.tradelovin.com", role: "legacy_redirect" },
	{ hostname: "xeoaxis.com", role: "mainland" },
	{ hostname: "www.xeoaxis.com", role: "mainland" },
]);

export function normalizeHostname(host) {
	return String(host ?? "")
		.trim()
		.toLowerCase()
		.split(":")[0];
}

function roleOf(hostname) {
	const host = normalizeHostname(hostname);
	return SITE_ENTRIES.find((e) => e.hostname === host)?.role ?? null;
}

export function isMainlandEntryHost(hostname) {
	return roleOf(hostname) === "mainland";
}

export function isLegacyOverseasHost(hostname) {
	return roleOf(hostname) === "legacy_redirect";
}

export function isCanonicalOverseasHost(hostname) {
	return roleOf(hostname) === "canonical";
}

export function isHttpsOnlyHost(hostname) {
	const host = normalizeHostname(hostname);
	if (!host) return false;
	const roots = ["xeoaxis.com", "tradelovin.com", "leolearnstotrade.com"];
	return roots.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function getMagicLinkAllowedHosts() {
	return SITE_ENTRIES.map((e) => e.hostname);
}
```

```ts
// src/lib/site-entries.mjs.d.ts
export type SiteEntryRole = "canonical" | "legacy_redirect" | "mainland";
export const SITE_ENTRIES: ReadonlyArray<{ readonly hostname: string; readonly role: SiteEntryRole }>;
export const CANONICAL_OVERSEAS_HOSTNAME: string;
export const MAINLAND_FALLBACK_ORIGIN: string;
export function normalizeHostname(host: string | null | undefined): string;
export function isMainlandEntryHost(hostname: string | null | undefined): boolean;
export function isLegacyOverseasHost(hostname: string | null | undefined): boolean;
export function isCanonicalOverseasHost(hostname: string | null | undefined): boolean;
export function isHttpsOnlyHost(hostname: string | null | undefined): boolean;
export function getMagicLinkAllowedHosts(): string[];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/site-entries.contract.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-entries.mjs src/lib/site-entries.mjs.d.ts tests/lib/site-entries.contract.test.mjs
git commit -m "$(cat <<'EOF'
feat(site): add multi-entry host registry for xeoaxis hardening

EOF
)"
```

---

### Task 2: `resolveAssetPrefix` 拒绝绝对 URL（T1）

**Files:**
- Create: `src/lib/site/resolve-asset-prefix.mjs`
- Create: `src/lib/site/resolve-asset-prefix.mjs.d.ts`
- Create: `tests/lib/site/resolve-asset-prefix.contract.test.mjs`
- Modify: `next.config.ts`（删除内联函数，改为 import）

**Interfaces:**
- Consumes: 无
- Produces: `resolveAssetPrefix(env?: { NEXT_ASSET_PREFIX?: string, ASSET_PREFIX?: string }): string | undefined`

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/site/resolve-asset-prefix.contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetPrefix } from "../../../src/lib/site/resolve-asset-prefix.mjs";

test("empty env yields undefined", () => {
	assert.equal(resolveAssetPrefix({}), undefined);
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "  " }), undefined);
});

test("ignores workers.dev absolute prefix", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://tradelovin.mark-377.workers.dev" }), undefined);
});

test("ignores absolute site-domain prefixes under multi-entry", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://leolearnstotrade.com" }), undefined);
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://xeoaxis.com" }), undefined);
	assert.equal(resolveAssetPrefix({ ASSET_PREFIX: "https://tradelovin.com/_next" }), undefined);
});

test("allows relative prefix without scheme", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "/cdn" }), "/cdn");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/site/resolve-asset-prefix.contract.test.mjs`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation + wire next.config**

```js
// src/lib/site/resolve-asset-prefix.mjs
export function resolveAssetPrefix(env = process.env) {
	const raw =
		(typeof env.NEXT_ASSET_PREFIX === "string" && env.NEXT_ASSET_PREFIX.trim()) ||
		(typeof env.ASSET_PREFIX === "string" && env.ASSET_PREFIX.trim()) ||
		"";
	if (!raw) return undefined;
	const normalized = raw.replace(/\/+$/, "");
	// 多入口：任何绝对 http(s) 前缀都会把内地入口静态资源钉死到外域。
	if (/^https?:\/\//i.test(normalized)) {
		console.warn(
			`[resolveAssetPrefix] 已忽略绝对前缀 "${normalized}"：多入口架构下必须使用同源相对路径。`,
		);
		return undefined;
	}
	return normalized;
}
```

```ts
// next.config.ts — replace inline resolveAssetPrefix with:
import { resolveAssetPrefix } from "./src/lib/site/resolve-asset-prefix.mjs";
const assetPrefix = resolveAssetPrefix();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/site/resolve-asset-prefix.contract.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site/resolve-asset-prefix.mjs src/lib/site/resolve-asset-prefix.mjs.d.ts tests/lib/site/resolve-asset-prefix.contract.test.mjs next.config.ts
git commit -m "$(cat <<'EOF'
fix(site): reject absolute assetPrefix for multi-entry safety

EOF
)"
```

---

### Task 3: 魔法链接 Host 优先（T2）+ 接线 send-login-link

**Files:**
- Create: `src/lib/auth/magic-link-origin.mjs`
- Create: `src/lib/auth/magic-link-origin.mjs.d.ts`
- Create: `tests/lib/auth/magic-link-origin.contract.test.mjs`
- Modify: `src/app/api/auth/send-login-link/route.ts`

**Interfaces:**
- Consumes: `getMagicLinkAllowedHosts`, `MAINLAND_FALLBACK_ORIGIN` from `site-entries.mjs`
- Produces: `resolveMagicLinkBaseUrl(input): string`；`isAllowedMagicLinkHost(hostname): boolean`

可参考分支 `codex/hotfix-xeoaxis-magic-link-origin-20260728`，但 allowlist **必须**来自 `getMagicLinkAllowedHosts()`，禁止本地再写死主机数组。

- [ ] **Step 1: Write the failing test**

复制 hotfix 中四条用例到 `tests/lib/auth/magic-link-origin.contract.test.mjs`（见该分支文件），并增加：

```js
test("allowlist stays in sync with site-entries", async () => {
	const { getMagicLinkAllowedHosts } = await import("../../../src/lib/site-entries.mjs");
	const { isAllowedMagicLinkHost } = await import("../../../src/lib/auth/magic-link-origin.mjs");
	for (const host of getMagicLinkAllowedHosts()) {
		assert.equal(isAllowedMagicLinkHost(host), true);
	}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/auth/magic-link-origin.contract.test.mjs`  
Expected: FAIL

- [ ] **Step 3: Implement magic-link-origin + update route**

`resolveMagicLinkBaseUrl` 逻辑顺序（与 hotfix 一致）：

1. 依次尝试 `originHeader`、`forwardedHost`（取第一个）、`hostHeader`、`requestUrl` 的 host
2. 若 `isAllowedMagicLinkHost` → 返回 `https://${host}`（无尾斜杠）
3. 否则若 `envOrigin` 的 host allowlisted → 用 env
4. 否则 `MAINLAND_FALLBACK_ORIGIN`

`send-login-link/route.ts` 的 `getMagicLinkBaseUrl`：

```ts
import { resolveMagicLinkBaseUrl } from "@/lib/auth/magic-link-origin.mjs";
import { MAINLAND_FALLBACK_ORIGIN } from "@/lib/site-entries.mjs";

function getMagicLinkBaseUrl(request: Request): string {
	return resolveMagicLinkBaseUrl({
		requestUrl: request.url,
		originHeader: request.headers.get("origin"),
		forwardedHost: request.headers.get("x-forwarded-host"),
		hostHeader: request.headers.get("host"),
		envOrigin: process.env.MAGIC_LINK_ORIGIN?.trim() || process.env.APP_ORIGIN?.trim() || "",
		fallbackOrigin: MAINLAND_FALLBACK_ORIGIN,
	});
}
```

删除 route 内旧的「优先 env 再 xeoaxis」逻辑。

- [ ] **Step 4: Run tests**

Run: `node --test tests/lib/auth/magic-link-origin.contract.test.mjs tests/lib/site-entries.contract.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/magic-link-origin.mjs src/lib/auth/magic-link-origin.mjs.d.ts tests/lib/auth/magic-link-origin.contract.test.mjs src/app/api/auth/send-login-link/route.ts
git commit -m "$(cat <<'EOF'
fix(auth): keep mainland magic links on request host

EOF
)"
```

---

### Task 4: Legacy 海外域 308 helper（T3）+ middleware / supabase 接线

**Files:**
- Create: `src/lib/site/legacy-overseas-redirect.mjs`
- Create: `src/lib/site/legacy-overseas-redirect.mjs.d.ts`
- Create: `tests/lib/site/legacy-overseas-redirect.contract.test.mjs`
- Create: `tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs`
- Modify: `src/middleware.ts`
- Modify: `src/lib/supabase/client.ts`

**Interfaces:**
- Consumes: `isLegacyOverseasHost`, `CANONICAL_OVERSEAS_HOSTNAME`, `isHttpsOnlyHost`, `isMainlandEntryHost`
- Produces:
  - `buildLegacyOverseasRedirectUrl({ hostname, href }): string | null`  
    — 仅当 `isLegacyOverseasHost(hostname)` 时返回把 host 换成 canonical 且 `protocol=https:` 的绝对 URL；mainland/canonical/其他 → `null`

- [ ] **Step 1: Write failing tests**

```js
// tests/lib/site/legacy-overseas-redirect.contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyOverseasRedirectUrl } from "../../../src/lib/site/legacy-overseas-redirect.mjs";

test("tradelovin redirects to leolearnstotrade preserving path and query", () => {
	const url = buildLegacyOverseasRedirectUrl({
		hostname: "tradelovin.com",
		href: "https://tradelovin.com/lab?x=1",
	});
	assert.equal(url, "https://leolearnstotrade.com/lab?x=1");
});

test("xeoaxis never redirects", () => {
	assert.equal(
		buildLegacyOverseasRedirectUrl({ hostname: "xeoaxis.com", href: "https://xeoaxis.com/" }),
		null,
	);
	assert.equal(
		buildLegacyOverseasRedirectUrl({ hostname: "www.xeoaxis.com", href: "https://www.xeoaxis.com/login" }),
		null,
	);
});

test("canonical host does not redirect", () => {
	assert.equal(
		buildLegacyOverseasRedirectUrl({
			hostname: "leolearnstotrade.com",
			href: "https://leolearnstotrade.com/",
		}),
		null,
	);
});
```

```js
// tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("middleware wires legacy overseas redirect helper and does not hardcode xeoaxis as legacy", async () => {
	const source = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
	assert.match(source, /buildLegacyOverseasRedirectUrl/);
	assert.match(source, /isHttpsOnlyHost/);
	assert.doesNotMatch(source, /LEGACY_HOSTNAMES\s*=\s*\[[^\]]*xeoaxis/);
	assert.doesNotMatch(source, /CANONICAL_HOSTNAME\s*=\s*["']xeoaxis/);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/lib/site/legacy-overseas-redirect.contract.test.mjs tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs`

- [ ] **Step 3: Implement helper + wire middleware/supabase**

```js
// src/lib/site/legacy-overseas-redirect.mjs
import { CANONICAL_OVERSEAS_HOSTNAME, isLegacyOverseasHost } from "../site-entries.mjs";

export function buildLegacyOverseasRedirectUrl({ hostname, href }) {
	if (!isLegacyOverseasHost(hostname)) return null;
	const url = new URL(href);
	url.protocol = "https:";
	url.host = CANONICAL_OVERSEAS_HOSTNAME;
	return url.toString();
}
```

在 `middlewareAsync` 靠前（HTTPS 强制之后、业务路由之前）插入：

```ts
import { isHttpsOnlyHost } from "@/lib/site-entries.mjs";
import { buildLegacyOverseasRedirectUrl } from "@/lib/site/legacy-overseas-redirect.mjs";

const legacyOverseas = buildLegacyOverseasRedirectUrl({
	hostname,
	href: request.nextUrl.href,
});
if (legacyOverseas) {
	return NextResponse.redirect(legacyOverseas, 308);
}
```

删除 middleware 内本地的 `HTTPS_ONLY_HOST_SUFFIXES` / `isHttpsOnlyHost`，改用 site-entries 导出。

`src/lib/supabase/client.ts`：

```ts
import { isMainlandEntryHost } from "@/lib/site-entries.mjs";
// ...
if (typeof window !== "undefined" && isMainlandEntryHost(window.location.hostname)) {
	url = window.location.origin + "/supabase-proxy";
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/lib/site/legacy-overseas-redirect.contract.test.mjs tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs tests/lib/site-entries.contract.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/lib/site/legacy-overseas-redirect.mjs src/lib/site/legacy-overseas-redirect.mjs.d.ts tests/lib/site/legacy-overseas-redirect.contract.test.mjs tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs src/middleware.ts src/lib/supabase/client.ts
git commit -m "$(cat <<'EOF'
fix(middleware): redirect legacy overseas hosts without touching xeoaxis

EOF
)"
```

---

### Task 5: 冒烟脚本 + package scripts + CI 门禁

**Files:**
- Create: `scripts/deploy/xeoaxis-entry-smoke.mjs`
- Create: `tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/opennext-build.yml`

**Interfaces:**
- Consumes: 无
- Produces: CLI exit 0/1；环境变量 `BASE_URL`（默认 `https://xeoaxis.com`）

- [ ] **Step 1: Write CI wiring contract test (fail first)**

```js
// tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

test("opennext workflow runs xeoaxis contract tests and post-deploy smoke", async () => {
	const source = await readFile(new URL(".github/workflows/opennext-build.yml", root), "utf8");
	assert.match(source, /test:contracts:xeoaxis/);
	assert.match(source, /smoke:xeoaxis/);
	assert.match(source, /XEOAXIS_RECOVERY\.md/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs`

- [ ] **Step 3: Implement smoke script + package.json + workflow**

`scripts/deploy/xeoaxis-entry-smoke.mjs` 行为：

1. `BASE_URL` 默认 `https://xeoaxis.com`，去尾斜杠。
2. `GET ${BASE_URL}/`，`redirect: "manual"`。
3. 若 status 为 301/302/307/308：读 `Location`，若 hostname 为 `leolearnstotrade.com` 或 `tradelovin.com`（含 www）→ FAIL。
4. 若非 200（且非同域中间跳转）→ FAIL。若同域 https 升级跳转，可再 follow 一次仅同域。
5. 取最终 HTML：断言不含 `workers.dev`；`/_next/static` 引用不得以 `https://leolearnstotrade.com` / `https://tradelovin.com` 开头。
6. 从 HTML 用正则抓第一个 `/_next/static/...` 路径，`GET` 同 origin → 必须 200。
7. 失败时 `console.error` 打印：`See ops/mainland-access/XEOAXIS_RECOVERY.md`

`package.json` scripts：

```json
"test:contracts:xeoaxis": "node --test tests/lib/site-entries.contract.test.mjs tests/lib/site/resolve-asset-prefix.contract.test.mjs tests/lib/auth/magic-link-origin.contract.test.mjs tests/lib/site/legacy-overseas-redirect.contract.test.mjs tests/middleware/legacy-overseas-redirect-wiring.contract.test.mjs tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs",
"smoke:xeoaxis": "node scripts/deploy/xeoaxis-entry-smoke.mjs"
```

`.github/workflows/opennext-build.yml`：

- 在 `Verify generated files sync` 之后增加：

```yaml
      - name: xeoaxis multi-entry contract tests
        run: npm run test:contracts:xeoaxis
```

- 在 `Verify release fingerprint` 之后增加（仅 main push deploy 路径，`if` 与 fingerprint 相同）：

```yaml
      - name: Verify xeoaxis mainland entry
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        env:
          BASE_URL: https://xeoaxis.com
        run: |
          set -euo pipefail
          npm run smoke:xeoaxis || {
            echo "::error::xeoaxis entry smoke failed. See ops/mainland-access/XEOAXIS_RECOVERY.md"
            exit 1
          }
```

- [ ] **Step 4: Run contracts locally**

Run: `npm run test:contracts:xeoaxis`  
Expected: PASS（含 workflow 源码断言）

可选（需网络）：`BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis`

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/xeoaxis-entry-smoke.mjs tests/ci/xeoaxis-entry-smoke-gate.contract.test.mjs package.json .github/workflows/opennext-build.yml
git commit -m "$(cat <<'EOF'
ci: gate multi-entry contracts and xeoaxis post-deploy smoke

EOF
)"
```

---

### Task 6: Cursor rule + 恢复 Runbook + DEPLOY 链接

**Files:**
- Create: `.cursor/rules/multi-entry-xeoaxis.mdc`
- Create: `ops/mainland-access/XEOAXIS_RECOVERY.md`
- Modify: `DEPLOY.md`（§6 说明改为「拒绝任何绝对 http(s) 前缀」；§9 链到 Runbook）
- Modify: `docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md` 状态改为「计划已就绪」若需要（可选，可不改）

- [ ] **Step 1: Write Cursor rule**

```md
---
description: Protect mainland xeoaxis.com multi-entry invariants
globs:
  - src/middleware.ts
  - next.config.ts
  - src/lib/site-entries.mjs
  - src/lib/site/**
  - src/lib/auth/magic-link-origin.mjs
  - src/app/api/auth/**
  - src/lib/supabase/client.ts
  - .github/workflows/opennext-build.yml
  - DEPLOY.md
  - ops/mainland-access/**
alwaysApply: false
---

# Multi-entry / xeoaxis 护栏

本仓库三入口共用 Worker：`leolearnstotrade.com`（canonical）、`tradelovin.com`（legacy 308）、`xeoaxis.com`（mainland）。

硬性规则：
1. 主机名与角色只改 `src/lib/site-entries.mjs`，并更新 `npm run test:contracts:xeoaxis`。
2. 禁止把 `xeoaxis` 加入 legacy 跳转列表；禁止 middleware 将内地入口 308 到海外。
3. 禁止设置绝对 `http(s)://` 的 `NEXT_ASSET_PREFIX`；`resolveAssetPrefix` 必须忽略绝对前缀。
4. 魔法链接必须 Host/Origin 优先；不得用 `MAGIC_LINK_ORIGIN` 覆盖 xeoaxis 请求。
5. 改动本 globs 内文件后必须运行：`npm run test:contracts:xeoaxis`。
6. 线上内地入口异常：先读 `ops/mainland-access/XEOAXIS_RECOVERY.md`。
```

- [ ] **Step 2: Write recovery runbook**

`ops/mainland-access/XEOAXIS_RECOVERY.md` 按 spec §3 写全 A–D：自检命令、症状表、env 修复、`npx wrangler rollback`、恢复后验证。文中命令：

```bash
./ops/mainland-access/verify-mainland-proxy.sh xeoaxis.com <worker-host>
BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis
npx wrangler rollback --message "xeoaxis: restore previous Worker version"
```

提醒：Supabase Redirect URLs 须保留 `https://xeoaxis.com/**`；`NEXT_ASSET_PREFIX` 必须为空。

- [ ] **Step 3: Update DEPLOY.md**

- §6：写明绝对 `http(s)` 前缀一律忽略（不仅 workers.dev）；链到 site-entries / 本护栏 spec。
- §9.4 末尾增加：恢复流程见 [`ops/mainland-access/XEOAXIS_RECOVERY.md`](ops/mainland-access/XEOAXIS_RECOVERY.md)。
- §4/海外域名段落：注明生产主域目标为 `leolearnstotrade.com`，`tradelovin.com` 为 legacy 308；**xeoaxis 不在跳转列表**。

- [ ] **Step 4: Verify contracts still pass**

Run: `npm run test:contracts:xeoaxis`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .cursor/rules/multi-entry-xeoaxis.mdc ops/mainland-access/XEOAXIS_RECOVERY.md DEPLOY.md
git commit -m "$(cat <<'EOF'
docs: add xeoaxis recovery runbook and agent multi-entry rule

EOF
)"
```

---

### Task 7: 本地验收清单（无新代码）

**Files:** 无（验证）

- [ ] **Step 1: Run full contract suite**

Run: `npm run test:contracts:xeoaxis`  
Expected: 全部 PASS

- [ ] **Step 2: Optional live smoke（需网络）**

Run: `BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis`  
Expected: PASS（若当前生产尚未部署本分支代码，魔法链接相关以契约为准；冒烟只查 HTML/static/不跨域跳转）

- [ ] **Step 3: Manual checklist against spec 验收标准**

- [ ] `site-entries` 为唯一主机名事实源；xeoaxis 角色 `mainland`
- [ ] T1–T4 由 `test:contracts:xeoaxis` 覆盖
- [ ] workflow 含部署后 xeoaxis 冒烟与 RECOVERY 提示
- [ ] `XEOAXIS_RECOVERY.md` 存在且 DEPLOY 已链接
- [ ] 契约证明：env=leo + Origin=xeoaxis → magic link base = xeoaxis
- [ ] 契约证明：tradelovin → leo URL；xeoaxis → null redirect

- [ ] **Step 4: Final commit only if docs/spec status tweak needed； otherwise stop**

若工作区干净则无需提交。若有未提交的 plan/spec：

```bash
git add docs/superpowers/specs/2026-07-29-xeoaxis-entry-hardening-design.md docs/superpowers/plans/2026-07-29-xeoaxis-entry-hardening.md
git commit -m "$(cat <<'EOF'
docs: add xeoaxis entry hardening spec and implementation plan

EOF
)"
```

---

## Spec coverage (self-review)

| Spec 项 | Task |
|---------|------|
| §1 site-entries 事实源 | Task 1 |
| §1 mainland 永不 308 | Task 4 |
| §1 supabase-proxy | Task 4 |
| §2 T1 assetPrefix | Task 2 |
| §2 T2 magic-link | Task 3 |
| §2 T3 middleware | Task 4 |
| §2 T4 site-entries roles | Task 1 |
| §2 Cursor rule | Task 6 |
| §2 CI contracts + smoke | Task 5 |
| §3 Recovery A–D | Task 6 |
| DEPLOY 链接 | Task 6 |
| 验收标准 | Task 7 |
| Phase 2 DNS/Stripe/Supabase Site URL 控制台 | 明确排除（Runbook 仅提醒保留 xeoaxis Redirect） |

## Out of scope follow-ups（下一计划）

- Cloudflare 绑定 `leolearnstotrade.com` / 验证线上 308
- 更新 `TQ_CRON_BASE_URL`、Stripe 回跳、Supabase Site URL（保留 xeoaxis Redirect）
- Lab WIP 全量移植（非本护栏所需）
