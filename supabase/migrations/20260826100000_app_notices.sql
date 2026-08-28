-- Official one-way in-app notices (not tq_risk_messages).

CREATE TABLE IF NOT EXISTS public.app_notices (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body TEXT NOT NULL,
	created_by TEXT NOT NULL,
	read_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT app_notices_title_len CHECK (char_length(title) BETWEEN 1 AND 80),
	CONSTRAINT app_notices_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS app_notices_user_created_idx
	ON public.app_notices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_notices_user_unread_idx
	ON public.app_notices(user_id, read_at, created_at DESC);

ALTER TABLE public.app_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_notices_own_select ON public.app_notices;
CREATE POLICY app_notices_own_select ON public.app_notices
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS app_notices_own_update_read ON public.app_notices;
CREATE POLICY app_notices_own_update_read ON public.app_notices
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.app_notices TO authenticated;
GRANT ALL ON public.app_notices TO service_role;

CREATE OR REPLACE FUNCTION public.app_notices_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.title IS DISTINCT FROM OLD.title
		OR NEW.body IS DISTINCT FROM OLD.body
		OR NEW.created_by IS DISTINCT FROM OLD.created_by
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'app_notices: only read_at may be updated';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_notices_guard_update ON public.app_notices;
CREATE TRIGGER app_notices_guard_update
BEFORE UPDATE ON public.app_notices
FOR EACH ROW
EXECUTE FUNCTION public.app_notices_guard_update();
