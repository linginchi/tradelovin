# 手动对齐 `public.registrations`（修复一键注册 / enroll 缺列）

当错误提示包含 **`user_id`**、**`schema cache`** 时，说明生产库未应用与代码一致的迁移。

## 推荐：Supabase CLI

在项目根目录（已登录 `supabase link`）执行：

```bash
supabase db push
```

## 仅 SQL Editor（按文件名顺序）

在 **Supabase Dashboard → SQL Editor** 中依次执行仓库内文件全文：

1. [`../migrations/20260430121800_registrations_status.sql`](../migrations/20260430121800_registrations_status.sql) — `status` 列  
2. [`../migrations/20260430122000_registrations_user_id_policies.sql`](../migrations/20260430122000_registrations_user_id_policies.sql) — `user_id`、索引、RLS  
3. [`../migrations/20260430124500_registrations_catchup_idempotent.sql`](../migrations/20260430124500_registrations_catchup_idempotent.sql) — 幂等补丁（含 `auth.users` 邮箱回填）

若已执行过 (1)(2)，单独补跑 **(3)** 通常即可。

执行完成后：**Settings → API** 侧等待 schema 刷新，或按官方文档重载 PostgREST。

## 验证

- Table Editor 中 `registrations` 存在列 `user_id`、`status`。  
- `POST /api/auth/quick-register` 或登录后 `POST /api/enroll` 不再报缺列。
