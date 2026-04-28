-- 管理后台：管理员表、邮箱 OTP 表、学员（registrations）扩展字段
-- 在 Supabase SQL Editor 中执行（需已有 public.registrations）
-- 若使用 CLI：同等逻辑已纳入 migrations/20260430127000_admins_bootstrap_mark.sql（admins 表 + mark@hkfac.com 行）；本文件仍含 admin_otp_challenges 与 registrations 扩展，请按需执行。

-- 管理员角色
do $$ begin
	create type public.admin_role as enum ('super_admin', 'admin');
exception
	when duplicate_object then null;
end $$;

create table if not exists public.admins (
	email text primary key,
	role public.admin_role not null,
	created_at timestamptz not null default now(),
	created_by text null
);

create index if not exists admins_role_idx on public.admins (role);

-- 超级管理员（可按需修改邮箱；须与 src/lib/auth/bootstrap-super-admin.ts 中 BOOTSTRAP_SUPER_ADMIN_EMAIL 一致）
insert into public.admins (email, role, created_by)
values ('mark@hkfac.com', 'super_admin', null)
on conflict (email) do update
set
	role = excluded.role;

alter table public.admins enable row level security;

-- 仅服务端 service_role 访问（无面向 anon/authenticated 的策略）
-- OTP 挑战（仅服务端写入/读取）
create table if not exists public.admin_otp_challenges (
	id uuid primary key default gen_random_uuid (),
	email text not null,
	code_hash text not null,
	expires_at timestamptz not null,
	created_at timestamptz not null default now()
);

create index if not exists admin_otp_email_idx on public.admin_otp_challenges (email, created_at desc);

alter table public.admin_otp_challenges enable row level security;

-- 学员报名信息扩展
alter table public.registrations add column if not exists student_id text;

alter table public.registrations add column if not exists address text;

alter table public.registrations add column if not exists status text not null default 'registered';

-- 建议在应用中使用的 status：registered | pending_review | enrolled | withdrawn

create unique index if not exists registrations_student_id_unique on public.registrations (student_id)
where
	student_id is not null;

create index if not exists registrations_status_idx on public.registrations (status);

create index if not exists registrations_search_idx on public.registrations (lower(nickname), lower(email));
