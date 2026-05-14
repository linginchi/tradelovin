CREATE TABLE IF NOT EXISTS public.email_login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_login_tokens_token ON public.email_login_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_login_tokens_email ON public.email_login_tokens(email);

ALTER TABLE public.email_login_tokens ENABLE ROW LEVEL SECURITY;
