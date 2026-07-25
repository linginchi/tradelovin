/**
 * 管理后台引导超级管理员（须与数据库 migrations / admins 表一致）。
 * 邮箱可安全用于 Client Component。
 */
export const BOOTSTRAP_SUPER_ADMIN_EMAIL = "mark@hkfac.com" as const;

/**
 * 全部引导超级管理员邮箱（同一人多个邮箱域名均视为超管）。
 * 须与数据库 migrations / admins 表保持一致。
 */
export const BOOTSTRAP_SUPER_ADMIN_EMAILS = ["mark@hkfac.com", "mark@hkfac.org"] as const;
