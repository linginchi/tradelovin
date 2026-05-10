-- T+0 V2 风控消息（P7）

CREATE TABLE IF NOT EXISTS public.tq_risk_messages (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	level TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('info', 'warning', 'error')),
	code TEXT,
	title TEXT NOT NULL,
	content TEXT NOT NULL,
	meta JSONB NOT NULL DEFAULT '{}'::jsonb,
	read_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_risk_messages_user_created_idx ON public.tq_risk_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tq_risk_messages_user_unread_idx ON public.tq_risk_messages(user_id, read_at, created_at DESC);

ALTER TABLE public.tq_risk_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_risk_messages_own_all ON public.tq_risk_messages;
CREATE POLICY tq_risk_messages_own_all ON public.tq_risk_messages
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
