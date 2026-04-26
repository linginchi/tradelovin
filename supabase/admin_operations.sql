-- 课程、排课、学员 profiles、选课、收费（profiles + course_schedules + student_courses 模型）
-- 在 registrations.sql 与 admin_auth_students.sql 之后执行
--
-- 若曾执行过旧版 admin_operations（students / instructors / course_sessions 等），会先 DROP 旧表（请备份生产数据）。

-- ---- 旧版结构清理 ----
drop table if exists public.course_enrollments cascade;
drop table if exists public.course_sessions cascade;
drop table if exists public.course_instructors cascade;
drop table if exists public.students cascade;
drop table if exists public.instructors cascade;
drop table if exists public.courses cascade;

-- ---- profiles（正式学员与讲师档案；管理员 OTP 仍用 public.admins）----
create table if not exists public.profiles (
	id uuid primary key default gen_random_uuid (),
	created_at timestamptz not null default now(),
	email text,
	full_name text,
	nickname text,
	phone text,
	avatar_url text,
	student_id text,
	address text,
	emergency_phone text,
	role text not null default 'user',
	bio text,
	specialties text[] not null default '{}',
	is_instructor boolean not null default false,
	fee_notice_sent_at timestamptz,
	constraint profiles_role_check check (
		role in ('user', 'admin', 'super_admin')
	)
);

create unique index if not exists profiles_student_id_unique on public.profiles (student_id)
where
	student_id is not null;

create index if not exists profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

-- 若项目里已有 profiles（例如与 auth 同步的表），仅追加缺失列：
alter table public.profiles add column if not exists email text;

alter table public.profiles add column if not exists full_name text;

alter table public.profiles add column if not exists nickname text;

alter table public.profiles add column if not exists phone text;

alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles add column if not exists student_id text;

alter table public.profiles add column if not exists address text;

alter table public.profiles add column if not exists emergency_phone text;

alter table public.profiles add column if not exists role text;

alter table public.profiles add column if not exists bio text;

alter table public.profiles add column if not exists specialties text[];

alter table public.profiles add column if not exists is_instructor boolean;

alter table public.profiles add column if not exists fee_notice_sent_at timestamptz;

alter table public.profiles
alter column role set default 'user';

update public.profiles
set
	role = 'user'
where
	role is null;

alter table public.profiles
alter column role set not null;

alter table public.profiles
alter column specialties set default '{}';

update public.profiles
set
	specialties = '{}'
where
	specialties is null;

alter table public.profiles
alter column specialties set not null;

update public.profiles
set
	is_instructor = false
where
	is_instructor is null;

alter table public.profiles
alter column is_instructor set not null;

alter table public.profiles
alter column is_instructor set default false;

do $$ begin
	alter table public.profiles
		add constraint profiles_role_check check (
			role in ('user', 'admin', 'super_admin')
		);
exception
	when duplicate_object then null;
end $$;

-- ---- 报名审核 ----
alter table public.registrations add column if not exists rejection_reason text;

alter table public.registrations add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

alter table public.registrations add column if not exists reviewed_at timestamptz;

update public.registrations
set
	status = 'pending'
where
	status in ('registered', 'pending_review');

alter table public.registrations
alter column status set default 'pending';

comment on column public.registrations.status is 'pending | approved | rejected';

-- ---- 课程（单讲师 -> profiles）----
create table public.courses (
	id uuid primary key default gen_random_uuid (),
	title text not null,
	description text,
	mode text,
	capacity int not null default 30 check (capacity > 0),
	instructor_id uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now(),
	constraint courses_mode_check check (
		mode is null
		or mode in ('online', 'offline')
	)
);

create index if not exists courses_title_idx on public.courses (lower(title));

alter table public.courses enable row level security;

-- ---- 课程日程 ----
create table public.course_schedules (
	id uuid primary key default gen_random_uuid (),
	course_id uuid not null references public.courses (id) on delete cascade,
	date date not null,
	start_time time not null,
	end_time time not null,
	location text,
	created_at timestamptz not null default now()
);

create index if not exists course_schedules_course_date_idx on public.course_schedules (course_id, date);

alter table public.course_schedules enable row level security;

-- ---- 学员选课 ----
create table public.student_courses (
	id uuid primary key default gen_random_uuid (),
	student_id uuid not null references public.profiles (id) on delete cascade,
	course_id uuid not null references public.courses (id) on delete cascade,
	schedule_id uuid references public.course_schedules (id) on delete set null,
	enrollment_date timestamptz not null default now(),
	payment_status text not null default 'unpaid',
	unique (student_id, course_id),
	constraint student_courses_payment_check check (
		payment_status in ('unpaid', 'paid', 'refunded')
	)
);

create index if not exists student_courses_course_idx on public.student_courses (course_id);

create index if not exists student_courses_student_idx on public.student_courses (student_id);

alter table public.student_courses enable row level security;

-- ---- 收费邮件审计 ----
create table if not exists public.fee_email_logs (
	id uuid primary key default gen_random_uuid (),
	sent_by text not null,
	subject text not null,
	body text not null,
	student_ids uuid[] not null,
	created_at timestamptz not null default now()
);

alter table public.fee_email_logs enable row level security;
