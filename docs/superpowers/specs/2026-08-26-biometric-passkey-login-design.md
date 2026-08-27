# 生物认证 · Passkey 登录

**Status:** Approved · 2026-08-26  
**Product:** 新紮學豹 · Web 登录（Supabase session）  
**Approach:** A — 自建 WebAuthn（`@simplewebauthn/server` + `@simplewebauthn/browser`），凭证存 Postgres，验证通过后沿用 magic-link 的 session 签发。  
**Hard constraint:** 不得破坏现有 Magic link 路径（发信、`/auth/magic-link` 跳转、`consumeMagicLink`、`email_login_tokens`、Host 决定邮件 origin、session mint 的 generateLink+verifyOtp）。Passkey 只复用 session 写入，不改、不绕开、不复制一套 token 表。

## 1. Problem

登录只有邮箱链接、密码、Google。回访用户每次都要输密码或开邮件。希望用本机 Face ID / Touch ID / Windows Hello 一键登录。

## 2. Goals

1. 已绑定 Passkey 的用户，在登录页点「使用 Face ID / Touch ID 登录」即可签发与现有登录相同的 Supabase cookie session。
2. 用户首次用邮箱 / 密码 / Google 登录成功后，若浏览器支持 WebAuthn 且本账号在当前域名尚无凭证，提示绑定（可跳过）。
3. 跳过后仍可在「我的资料」再绑定一次；不支持的浏览器隐藏入口，现有三种登录不受影响。

## 3. Non-Goals

- 敏感操作二次验证（交易、付款、改密码前再刷脸）。
- Passkey 设备列表、改名、删除多台设备（v1 只绑定/再绑定，不做管理台）。
- 跨域名共用同一枚 Passkey（`leolearnstotrade.com` 与 `xeoaxis.com` 各自独立绑定）。
- 原生 iOS/Android SDK、微信内置浏览器专项适配。
- 改 Stripe、会员门槛、middleware 全局 `next`。
- 用 localStorage 假生物识别替代 WebAuthn。

## 4. Relying Party

| 当前 Host | `rpId` |
|---|---|
| `leolearnstotrade.com` / `www.leolearnstotrade.com` | `leolearnstotrade.com` |
| `xeoaxis.com` / `www.xeoaxis.com` | `xeoaxis.com` |
| `localhost` / `127.0.0.1` | `localhost` |
| 其它 | 拒绝生成 options（400） |

- `rpName`：`新紮學豹`
- `origin` 必须与请求 Origin 一致，且属于该 `rpId` 的 https origin（本地允许 `http://localhost`）。
- `tradelovin.com` 为 legacy 308，不在此站绑定；用户会落到 canonical 域名再绑。

同一用户在海外站与内地站各绑一枚。产品文案写清：换入口域名需要重新绑定。

## 5. Data

### `user_passkey_credentials`

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| user_id | uuid NOT NULL | `auth.users.id` ON DELETE CASCADE |
| rp_id | text NOT NULL | 上表 `rpId` |
| credential_id | text NOT NULL | base64url，全局唯一 |
| public_key | bytea NOT NULL | WebAuthn 公钥 |
| sign_count | bigint NOT NULL | 默认 0；校验后单调递增 |
| transports | text[] | 可选，如 `internal` / `hybrid` |
| device_label | text | 可选，浏览器 UA 摘要，最长 80 |
| created_at | timestamptz | 默认 `now()` |
| last_used_at | timestamptz | 登录成功时更新 |

唯一约束：`(credential_id)`；索引 `(user_id, rp_id)`。

v1 每个 `(user_id, rp_id)` 允许 **最多 1 枚**。再绑定先删旧凭证再写入，避免无人管理的幽灵设备。

RLS：`authenticated` 仅 SELECT 自己的行（`user_id = auth.uid()`）。INSERT / UPDATE / DELETE 只走 service role。

### `passkey_challenges`

Workers 无可靠内存，challenge 必须落库。

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 返回给客户端，verify 时带回 |
| user_id | uuid NULL | 注册必填；登录可空（discoverable） |
| purpose | text | `register` \| `login` |
| rp_id | text NOT NULL | |
| challenge | text NOT NULL | base64url |
| expires_at | timestamptz NOT NULL | 创建 + 5 分钟 |
| consumed_at | timestamptz NULL | 一次性 |

无 RLS 给 `authenticated`；仅 service role。过期行可在 verify 时顺手删除，不做独立 cron。

## 6. Session

Passkey 登录成功后 **不得** 新开一套 cookie，也 **不得** 把 `mintSessionTokens` / `createEphemeralAnonClient` 搬出 [`src/lib/auth/magic-link.ts`](src/lib/auth/magic-link.ts)（现有合同测试按该文件源码锁定 generateLink + verifyOtp）。

做法：把已有的 `establishMagicLinkSession` **导出**，Passkey `login/verify` 直接调用。magic-link 的 `consumeMagicLink` 调用点、token 消耗顺序、handoff 逻辑保持原样。

禁止：

- 改 [`src/app/api/auth/send-login-link/route.ts`](src/app/api/auth/send-login-link/route.ts) 的邮件 URL 形状（必须仍是 `{base}/auth/magic-link?token=`）。
- 改 [`src/app/auth/magic-link/route.ts`](src/app/auth/magic-link/route.ts) 单跳转发到 `/api/auth/magic-link`。
- 改 `consumeMagicLink` 的「先建 session 再 burn token」顺序。
- 在 Passkey 路径里 `setSession` 或 cookie-adapter `signInWithPassword`。

## 7. APIs

全部 POST（除 status），`requireSameOriginForMutation`。不加入 CSRF 豁免名单。

| 路径 | 登录要求 | 行为 |
|---|---|---|
| `GET /api/auth/passkey/status` | 要 | `{ enrolled, rpId }`。`enrolled` = 当前用户在当前 `rpId` 是否已有凭证。浏览器是否支持 WebAuthn 只在客户端判断。 |
| `POST /api/auth/passkey/register/options` | 要 | 已 enrolled → 409。否则生成 creation options；`residentKey: required`，`userVerification: required`，`user.id` = auth user uuid。返回 `{ challengeId, options }`。 |
| `POST /api/auth/passkey/register/verify` | 要 | `{ challengeId, credential }`。校验 origin / rpId / challenge；写入凭证（替换同 rpId 旧行）；消费 challenge。 |
| `POST /api/auth/passkey/login/options` | 否 | discoverable：`allowCredentials` 空。`userVerification: required`。返回 `{ challengeId, options }`。 |
| `POST /api/auth/passkey/login/verify` | 否 | `{ challengeId, credential, next? }`。校验签名与 `signCount`（新值必须 ≥ 存值；相等仅当 authenticator 报 0 时允许）。更新 `sign_count` / `last_used_at`。用凭证 `user_id` 查 email，`mintSessionTokens`，写 cookie。`next` 经 `sanitizeNextPath`。JSON `{ success, redirectTo }`，由客户端跳转（与密码登录一致）。 |

错误码对客户端稳定：`unsupported_rp`、`not_enrolled`、`challenge_expired`、`verify_failed`、`already_enrolled`。文案走 i18n，不把内部 exception 回给用户。

## 8. UX

### 登录页

[`src/app/[locale]/login/page.tsx`](src/app/[locale]/login/page.tsx) 在 Tabs **上方**放 `PasskeyLoginButton`：

- 仅当 `window.PublicKeyCredential` 存在时渲染。
- 文案：简「使用 Face ID / Touch ID 登录」；繁同义；英 “Sign in with Face ID / Touch ID”。
- 失败：toast + 保留邮箱/密码/Google。用户取消系统弹窗不当成硬错误，用轻提示「已取消」。

不把 Passkey 做成第三 tab，避免和「必须先选方式」抢注意力。

### 绑定提示（首次登录后）

客户端组件 `PasskeyEnrollPrompt`，挂在已登录壳层（与 `SiteTopBar` 同级即可，避免每个页面复制）：

1. `useAuth` 已登录，且 `GET /api/auth/passkey/status` 的 `enrolled === false`。
2. 浏览器支持 WebAuthn。
3. `localStorage` 无 `passkey_enroll_dismissed:{userId}:{rpId}`。

卡片：说明「下次可用面容/指纹登录」；主按钮绑定；次按钮「以后再说」（写入 dismissed）。绑定成功 toast，不再出现。

### 我的资料

[`ProfilePasswordSection`](src/components/profile/ProfilePasswordSection.tsx) 旁增加一节：未绑定显示「绑定快速登录」；已绑定显示「已绑定 · 重新绑定」（覆盖同一 `rpId` 的唯一凭证）。无设备列表。

## 9. 安全

- Challenge 5 分钟、一次性、绑定 purpose。
- `signCount` 回退视为 `verify_failed`（除 authenticator 恒为 0）。
- 注册必须已登录；登录 verify 只信任凭证记录里的 `user_id`，不信任客户端传的 user。
- 不在日志里打 credential 原始 JSON。
- HTTPS-only（现有 CSRF 生产校验 `x-forwarded-proto`）。

## 10. i18n

`MagicLogin` + `MyProfile` 增加 Passkey 键，三语同步：`zh` / `zh-TW` / `en`。不要把系统词写成「生物识别 API」。

## 11. Tests

- 单测 `resolvePasskeyRpId(host)`：canonical / www / xeoaxis / localhost / 拒绝 tradelovin.com。
- 单测 verify 规则：过期 challenge、signCount 回退、已绑定 409、sanitize next。
- 合同测试：登录页引用 `PasskeyLoginButton`；四条 API 文件存在。
- 手工：Safari Face ID、Chrome platform authenticator、无 WebAuthn 隐藏按钮、跳过后再从资料页绑定。

## 12. Files

- `supabase/migrations/20260826200000_user_passkeys.sql`
- `src/lib/auth/mint-session.ts` — 从 magic-link 抽出
- `src/app/api/auth/passkey/**/route.ts`
- `src/components/auth/PasskeyLoginButton.tsx`
- `src/components/auth/PasskeyEnrollPrompt.tsx`
- `src/components/profile/ProfilePasskeySection.tsx`
- `tests/auth/passkey.test.ts`
- `messages/zh.json` · `zh-TW.json` · `en.json`

依赖：`@simplewebauthn/server`、`@simplewebauthn/browser`。确认可在 Cloudflare Workers / OpenNext 运行（只用 Web Crypto，不引入 Node `crypto` 独有 API）。
