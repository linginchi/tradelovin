-- 在 Supabase SQL Editor 中执行，创建报名表（与 registration-form 提交字段一致）
-- trading_style_preferences：字符串数组，存储 value 如 trend_following、breakout 等

create table if not exists public.registrations (
	id uuid primary key default gen_random_uuid (),
	created_at timestamptz not null default now(),
	real_name text,
	nickname text not null,
	email text not null,
	phone text,
	trading_experience text not null,
	trading_style_preferences text[] not null default '{}',
	learning_goals text,
	willing_to_be_recommended text not null
);

create index if not exists registrations_email_idx on public.registrations (lower(email));

alter table public.registrations enable row level security;

-- 匿名报名仅允许插入（按需在 Dashboard 收紧或改为 Edge Function）
create policy "Allow anonymous insert on registrations" on public.registrations for insert to anon
with
	check (true);
