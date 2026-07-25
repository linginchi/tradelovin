-- KOL 自荐申请（匿名 + 邮箱验证，与 channel_partners 分离）

CREATE TABLE IF NOT EXISTS public.kol_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  channel_name TEXT,
  platform_accounts JSONB NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'pending_review', 'approved', 'rejected')),
  reject_reason TEXT,
  invite_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kol_applications_email_idx ON public.kol_applications (lower(email));
CREATE INDEX IF NOT EXISTS kol_applications_status_idx ON public.kol_applications (status);

ALTER TABLE public.kol_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification_codes DROP CONSTRAINT IF EXISTS email_verification_codes_intent_check;
ALTER TABLE public.email_verification_codes ADD CONSTRAINT email_verification_codes_intent_check
  CHECK (intent IN ('register', 'login', 'kol_application'));
