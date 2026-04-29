/**
 * 管理后台引导超级管理员（须与数据库 migrations / admins 表一致）。
 * 邮箱可安全用于 Client Component；固定 OTP 仅应与 `verify-code` 路由保持一致，快捷登录按钮仅在开启
 * `NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN` 或本地开发时进入前端包。
 */
export const BOOTSTRAP_SUPER_ADMIN_EMAIL = "mark@hkfac.com" as const;

/** 固定 OTP；须与 `src/app/api/admin/auth/verify-code/route.ts` 校验逻辑一致 */
export const BOOTSTRAP_SUPER_ADMIN_FIXED_OTP = "123456" as const;
