# Passkey 生物认证登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) task-by-task. Steps use checkbox (`- [ ]`) syntax. **Do not commit** unless the user asks. **Do not edit** `consumeMagicLink`, send-login-link URL shape, or `/auth/magic-link` hop except exporting `establishMagicLinkSession`.

**Goal:** 登录页可用 Face ID / Touch ID（WebAuthn Passkey）签发与现有登录相同的 Supabase cookie；首次登录后可绑定；**现有 Magic link 发信与点击登录路径零行为变化**。

**Architecture:** 纯函数处理 `rpId` / challenge 窗口 / `signCount`。凭证与 challenge 存 Postgres（service role 写）。Passkey 登录成功后调用已有 `establishMagicLinkSession`，不复制 mint 逻辑、不新建 `mint-session.ts`。UI 仅增量：登录页按钮、顶栏下提示、资料页一节。

**Tech Stack:** Next.js App Router、`@simplewebauthn/server` + `@simplewebauthn/browser`、Supabase、next-intl、node:test。

## Global Constraints

- 不得破坏现有 Magic link 路径（发信、`/auth/magic-link` 跳转、`consumeMagicLink`、`email_login_tokens`、Host 决定邮件 origin、session mint 的 generateLink+verifyOtp）。
- 不把 `mintSessionTokens` / `createEphemeralAnonClient` 搬出 `src/lib/auth/magic-link.ts`。
- 每个 `(user_id, rp_id)` 最多 1 枚凭证；再绑定覆盖。
- `rpId`：`leolearnstotrade.com` | `xeoaxis.com` | `localhost`；拒绝 `tradelovin.com`。
- Challenge 5 分钟、一次性；`userVerification: required`；注册 `residentKey: required`。
- 不支持 WebAuthn 的浏览器隐藏入口。
- 三语文案同步；未要求则不 commit。

## File map

- Create: `src/lib/auth/passkey.ts`
- Create: `tests/auth/passkey.test.ts`
- Create: `supabase/migrations/20260826200000_user_passkeys.sql`
- Create: `src/app/api/auth/passkey/status/route.ts`
- Create: `src/app/api/auth/passkey/register/options/route.ts`
- Create: `src/app/api/auth/passkey/register/verify/route.ts`
- Create: `src/app/api/auth/passkey/login/options/route.ts`
- Create: `src/app/api/auth/passkey/login/verify/route.ts`
- Create: `src/components/auth/PasskeyLoginButton.tsx`
- Create: `src/components/auth/PasskeyEnrollPrompt.tsx`
- Create: `src/components/profile/ProfilePasskeySection.tsx`
- Modify: `src/lib/auth/magic-link.ts` — **仅**把 `establishMagicLinkSession` 改为 `export`
- Modify: `tests/lib/auth/magic-link-session-mint.contract.test.mjs` — 加「consume 路径未拆走」断言
- Modify: `src/app/[locale]/login/page.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/my-profile/page.tsx`
- Modify: `messages/zh.json`, `messages/zh-TW.json`, `messages/en.json`
- Modify: `package.json` — 增加 simplewebauthn 依赖
- Create: `tests/auth/passkey-ui.contract.test.mjs`

---

### Task 1: 加固 Magic link 合同测试（回归闸门）

**Files:**
- Modify: `tests/lib/auth/magic-link-session-mint.contract.test.mjs`
- Modify: `src/lib/auth/magic-link.ts`（仅 `export` `establishMagicLinkSession`）

**Interfaces:**
- Produces: `export async function establishMagicLinkSession(srv, response, emailLower, userId)` 签名保持现有实现，一字不改内部 mint。

- [ ] **Step 1: 扩展闸门测试**

在 `tests/lib/auth/magic-link-session-mint.contract.test.mjs` 追加（保留原 test 不动）：

```js
test("consumeMagicLink still burns email_login_tokens after session mint", () => {
	assert.match(source, /export async function consumeMagicLink/);
	assert.match(source, /from\("email_login_tokens"\)/);
	assert.match(source, /establishMagicLinkSession/);
	const consumeIdx = source.indexOf("export async function consumeMagicLink");
	const burnIdx = source.indexOf("update({ used: true })", consumeIdx);
	const establishIdx = source.indexOf("establishMagicLinkSession", consumeIdx);
	assert.ok(establishIdx > consumeIdx);
	assert.ok(burnIdx > establishIdx);
});

test("send-login-link and HTML hop still point at /auth/magic-link", async () => {
	const { readFileSync } = await import("node:fs");
	const send = readFileSync(join(root, "src/app/api/auth/send-login-link/route.ts"), "utf8");
	const hop = readFileSync(join(root, "src/app/auth/magic-link/route.ts"), "utf8");
	const api = readFileSync(join(root, "src/app/api/auth/magic-link/route.ts"), "utf8");
	assert.match(send, /\/auth\/magic-link\?token=/);
	assert.match(hop, /\/api\/auth\/magic-link/);
	assert.match(api, /consumeMagicLink/);
	assert.doesNotMatch(api, /passkey/);
});
```

- [ ] **Step 2: 跑现有+新合同**

```bash
node --test tests/lib/auth/magic-link-session-mint.contract.test.mjs tests/lib/auth/magic-link-origin.contract.test.mjs
```

Expected: PASS（导出前源码已含 `establishMagicLinkSession` 函数名）

- [ ] **Step 3: 仅把 `async function establishMagicLinkSession` 改成 `export async function establishMagicLinkSession`。禁止移动 `mintSessionTokens` / `createEphemeralAnonClient`。**

- [ ] **Step 4: 再跑 Step 2 命令，必须仍 PASS。**

---

### Task 2: Passkey 纯函数（TDD）

**Files:**
- Create: `tests/auth/passkey.test.ts`
- Create: `src/lib/auth/passkey.ts`

**Interfaces:**
- Produces:

```ts
export type PasskeyRpId = "leolearnstotrade.com" | "xeoaxis.com" | "localhost";
export type PasskeyErrorCode =
	| "unsupported_rp"
	| "not_enrolled"
	| "challenge_expired"
	| "verify_failed"
	| "already_enrolled";

export function resolvePasskeyRpId(host: string): PasskeyRpId | null;
export function passkeyOriginAllowed(origin: string, rpId: PasskeyRpId): boolean;
export function isChallengeOpen(row: { expires_at: string; consumed_at: string | null }, nowMs: number): boolean;
export function isSignCountValid(stored: number, incoming: number): boolean;
export function enrollDismissStorageKey(userId: string, rpId: PasskeyRpId): string;
export const PASSKEY_CHALLENGE_TTL_MS: number;
```

- [ ] **Step 1: 写失败测试** `tests/auth/passkey.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	enrollDismissStorageKey,
	isChallengeOpen,
	isSignCountValid,
	passkeyOriginAllowed,
	resolvePasskeyRpId,
} from "@/lib/auth/passkey";

test("resolvePasskeyRpId maps entry hosts and rejects legacy tradelovin", () => {
	assert.equal(resolvePasskeyRpId("leolearnstotrade.com"), "leolearnstotrade.com");
	assert.equal(resolvePasskeyRpId("www.leolearnstotrade.com"), "leolearnstotrade.com");
	assert.equal(resolvePasskeyRpId("xeoaxis.com"), "xeoaxis.com");
	assert.equal(resolvePasskeyRpId("www.xeoaxis.com"), "xeoaxis.com");
	assert.equal(resolvePasskeyRpId("localhost:3001"), "localhost");
	assert.equal(resolvePasskeyRpId("127.0.0.1"), "localhost");
	assert.equal(resolvePasskeyRpId("tradelovin.com"), null);
	assert.equal(resolvePasskeyRpId("www.tradelovin.com"), null);
});

test("passkeyOriginAllowed matches https rp and http localhost", () => {
	assert.equal(passkeyOriginAllowed("https://leolearnstotrade.com", "leolearnstotrade.com"), true);
	assert.equal(passkeyOriginAllowed("https://www.leolearnstotrade.com", "leolearnstotrade.com"), true);
	assert.equal(passkeyOriginAllowed("https://xeoaxis.com", "leolearnstotrade.com"), false);
	assert.equal(passkeyOriginAllowed("http://localhost:3001", "localhost"), true);
});

test("challenge is one-shot and 5-minute window", () => {
	const now = Date.parse("2026-08-26T13:00:00.000Z");
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T13:04:59.000Z", consumed_at: null }, now),
		true,
	);
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T12:59:59.000Z", consumed_at: null }, now),
		false,
	);
	assert.equal(
		isChallengeOpen({ expires_at: "2026-08-26T13:04:59.000Z", consumed_at: "2026-08-26T12:58:00.000Z" }, now),
		false,
	);
});

test("signCount rejects rollback except both-zero authenticators", () => {
	assert.equal(isSignCountValid(0, 0), true);
	assert.equal(isSignCountValid(3, 4), true);
	assert.equal(isSignCountValid(4, 4), false);
	assert.equal(isSignCountValid(5, 4), false);
	assert.equal(isSignCountValid(2, 0), false);
});

test("enroll dismiss key is per user and rpId", () => {
	assert.equal(
		enrollDismissStorageKey("user-1", "xeoaxis.com"),
		"passkey_enroll_dismissed:user-1:xeoaxis.com",
	);
});
```

- [ ] **Step 2: 跑测确认失败（模块不存在）**

```bash
node --loader ./tests/lab/ts-loader.mjs --test tests/auth/passkey.test.ts
```

Expected: FAIL `无法解析项目别名：@/lib/auth/passkey`

- [ ] **Step 3: 最小实现** `src/lib/auth/passkey.ts`

```ts
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function resolvePasskeyRpId(host: string): PasskeyRpId | null {
	const h = String(host ?? "").trim().toLowerCase().split(":")[0] ?? "";
	if (h === "localhost" || h === "127.0.0.1") return "localhost";
	if (h === "leolearnstotrade.com" || h === "www.leolearnstotrade.com") return "leolearnstotrade.com";
	if (h === "xeoaxis.com" || h === "www.xeoaxis.com") return "xeoaxis.com";
	return null;
}

export function passkeyOriginAllowed(origin: string, rpId: PasskeyRpId): boolean {
	try {
		const u = new URL(origin);
		const hostRp = resolvePasskeyRpId(u.host);
		if (hostRp !== rpId) return false;
		if (rpId === "localhost") return u.protocol === "http:" || u.protocol === "https:";
		return u.protocol === "https:";
	} catch {
		return false;
	}
}

export function isChallengeOpen(
	row: { expires_at: string; consumed_at: string | null },
	nowMs: number,
): boolean {
	if (row.consumed_at) return false;
	const exp = Date.parse(row.expires_at);
	return Number.isFinite(exp) && exp >= nowMs;
}

export function isSignCountValid(stored: number, incoming: number): boolean {
	if (incoming === 0) return stored === 0;
	return incoming > stored;
}

export function enrollDismissStorageKey(userId: string, rpId: PasskeyRpId): string {
	return `passkey_enroll_dismissed:${userId}:${rpId}`;
}
```

- [ ] **Step 4: 再跑 Step 2，Expected: 全部 PASS。**

---

### Task 3: 表 + API（复用 magic-link session）

**Files:**
- Create: `supabase/migrations/20260826200000_user_passkeys.sql`
- Create: 五个 `src/app/api/auth/passkey/**/route.ts`
- Modify: `package.json` 加依赖 `@simplewebauthn/server` `@simplewebauthn/browser`

**Interfaces:**
- Consumes: `resolvePasskeyRpId`, `passkeyOriginAllowed`, `isChallengeOpen`, `isSignCountValid`, `establishMagicLinkSession`, `requireTradeUser`, `requireSameOriginForMutation`, `sanitizeNextPath`, `getServiceSupabase`
- Produces: JSON `{ success, error?, code?, enrolled?, rpId?, challengeId?, options?, redirectTo? }`

- [ ] **Step 1: 安装依赖**

```bash
npm install @simplewebauthn/server @simplewebauthn/browser
```

确认未删 magic-link 相关包。

- [ ] **Step 2: 迁移 SQL**（必须包含）

```sql
CREATE TABLE IF NOT EXISTS public.user_passkey_credentials (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	rp_id TEXT NOT NULL,
	credential_id TEXT NOT NULL UNIQUE,
	public_key BYTEA NOT NULL,
	sign_count BIGINT NOT NULL DEFAULT 0,
	transports TEXT[],
	device_label TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_used_at TIMESTAMPTZ,
	CONSTRAINT user_passkey_one_per_rp UNIQUE (user_id, rp_id),
	CONSTRAINT user_passkey_device_label_len CHECK (device_label IS NULL OR char_length(device_label) <= 80)
);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
	purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
	rp_id TEXT NOT NULL,
	challenge TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	consumed_at TIMESTAMPTZ
);

ALTER TABLE public.user_passkey_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_passkey_own_select ON public.user_passkey_credentials
FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.user_passkey_credentials TO authenticated;
GRANT ALL ON public.user_passkey_credentials TO service_role;
GRANT ALL ON public.passkey_challenges TO service_role;
```

`passkey_challenges` 不对 `authenticated` 开放。

- [ ] **Step 3: 路由要点**

`GET /api/auth/passkey/status`：`requireTradeUser`；`rpId = resolvePasskeyRpId(host)` 为 null 则 400 `unsupported_rp`；查 `user_passkey_credentials` 得 `enrolled`。

`POST register/options`：登录 + CSRF；已有同 `rpId` 行且 `replace !== true` → 409 `already_enrolled`；`generateRegistrationOptions`（`rpID`, `rpName: "新紮學豹"`, `authenticatorSelection: { residentKey: "required", userVerification: "required" }`）；插入 challenge，`expires_at = now + PASSKEY_CHALLENGE_TTL_MS`。

`POST register/verify`：`verifyRegistrationResponse`；`passkeyOriginAllowed`；`isChallengeOpen`；purpose 必须 `register` 且 `user_id` 匹配；先删同 `(user_id, rp_id)` 再 insert；标记 `consumed_at`。

`POST login/options`：无需登录 + CSRF；`generateAuthenticationOptions`（`allowCredentials: []`, `userVerification: "required"`）；challenge `user_id` 为空。

`POST login/verify`：无需登录 + CSRF；`verifyAuthenticationResponse` 对照 DB 公钥；`isSignCountValid`；更新 `sign_count`/`last_used_at`；查用户 email；**调用 `establishMagicLinkSession(srv, response, emailLower, userId)`**；JSON `{ success: true, redirectTo: sanitizeNextPath(next) }`。若 host 是 legacy overseas，复制 magic-link API 的 `needsOverseasSessionHandoff` 分支。

错误：过期 → 400 `challenge_expired`；签名失败 → 400 `verify_failed`；无凭证 → 400 `not_enrolled`。

- [ ] **Step 4: 合同测试** `tests/auth/passkey-ui.contract.test.mjs` 先断言 API 文件存在，且 login/verify 引用 `establishMagicLinkSession`、**不含** `consumeMagicLink` / `email_login_tokens`：

```js
assert.match(verifySrc, /establishMagicLinkSession/);
assert.doesNotMatch(verifySrc, /consumeMagicLink/);
assert.doesNotMatch(verifySrc, /email_login_tokens/);
```

- [ ] **Step 5: 再跑 magic-link 合同（Task 1 命令）必须 PASS。**

---

### Task 4: UI + i18n

**Files:**
- Create: `src/components/auth/PasskeyLoginButton.tsx`
- Create: `src/components/auth/PasskeyEnrollPrompt.tsx`
- Create: `src/components/profile/ProfilePasskeySection.tsx`
- Modify: `src/app/[locale]/login/page.tsx` — Tabs **上方**插入按钮
- Modify: `src/app/[locale]/layout.tsx` — `<SiteTopBar />` 后 `<PasskeyEnrollPrompt />`
- Modify: `src/app/[locale]/my-profile/page.tsx` — `ProfilePasswordSection` 旁
- Modify: `messages/zh.json` / `zh-TW.json` / `en.json`

**Interfaces:**
- Consumes: `/api/auth/passkey/*`，`enrollDismissStorageKey`，`useAuth`；`next` 解析与密码登录相同。

- [ ] **Step 1: 文案键（三语都要有）**

`MagicLogin.passkeyLogin` / `passkeyLoggingIn` / `passkeyCancelled` / `passkeyFailed` / `passkeyEnrollTitle` / `passkeyEnrollBody` / `passkeyEnrollCta` / `passkeyEnrollSkip` / `passkeyEnrollSuccess`

`MyProfile.passkeySectionTitle` / `passkeyBind` / `passkeyRebind` / `passkeyBound`

简体示例：`使用 Face ID / Touch ID 登录`；`下次可用面容或指纹登录`；`以后再说`。

- [ ] **Step 2: `PasskeyLoginButton`**

仅 `window.PublicKeyCredential` 时渲染。流程：`login/options` → `startAuthentication` → `login/verify` → `window.location.assign(redirectTo)`。AbortError → `passkeyCancelled` toast。

- [ ] **Step 3: `PasskeyEnrollPrompt`**

已登录 + status `enrolled === false` + WebAuthn + localStorage 无 dismiss key。主按钮 register options/verify（不传 `replace`）；跳过写 `localStorage.setItem(enrollDismissStorageKey(userId, rpId), "1")`。未登录时 `return null`。

- [ ] **Step 4: `ProfilePasskeySection`**

未绑定：绑定按钮。已绑定：「已绑定 · 重新绑定」，options 传 `{ replace: true }`。

- [ ] **Step 5: 扩展 `tests/auth/passkey-ui.contract.test.mjs`：**

```js
assert.match(loginPage, /PasskeyLoginButton/);
assert.match(layout, /PasskeyEnrollPrompt/);
assert.match(profile, /ProfilePasskeySection/);
```

- [ ] **Step 6: 再跑**

```bash
node --loader ./tests/lab/ts-loader.mjs --test tests/auth/passkey.test.ts
node --test tests/lib/auth/magic-link-session-mint.contract.test.mjs tests/lib/auth/magic-link-origin.contract.test.mjs tests/auth/passkey-ui.contract.test.mjs
```

Expected: 全部 PASS。

---

### Task 5: 手工验证清单（完成前必做）

- [ ] 未登录打开 `/login`：邮箱链接 tab、密码 tab 仍在；有 WebAuthn 时出现 Passkey 按钮。
- [ ] 发一封 magic link：邮件 URL 仍为 `/auth/magic-link?token=...`；点击后仍登录成功（与改前相同）。
- [ ] 登录后提示绑定；跳过不再每页死循环；资料页仍能绑定。
- [ ] 绑定后登出，Passkey 登录进入 `next` 或默认 `/my-learning`。
- [ ] 无 WebAuthn：按钮不出现。
- [ ] 跑 Task 4 Step 6 全绿后再宣称完成。

## Spec coverage

| Spec | Task |
|---|---|
| Magic link 零破坏 | 1, 3.5, 5 |
| rpId / origin / signCount / challenge | 2 |
| 表 + API | 3 |
| 登录按钮 / 首次提示 / 资料页 | 4 |
| 每 rp 一枚、覆盖重绑 | 3 + Task 4 `replace` |
| 三语 | 4 |
| 不支持则隐藏 | 4 |
