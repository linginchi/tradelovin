-- Lab multimodal provider: gemini/glm → volcano only. Do not store API keys.

ALTER TABLE public.lab_sessions DROP CONSTRAINT IF EXISTS lab_sessions_provider_check;

UPDATE public.lab_sessions
SET provider = 'volcano'
WHERE provider IS DISTINCT FROM 'volcano';

ALTER TABLE public.lab_sessions
	ALTER COLUMN provider SET DEFAULT 'volcano';

ALTER TABLE public.lab_sessions
	ADD CONSTRAINT lab_sessions_provider_check CHECK (provider = 'volcano');

INSERT INTO public.lab_config (key, value, updated_at)
VALUES (
	'active_model',
	'{"provider":"volcano","model_id":"pending-spike"}'::jsonb,
	NOW()
)
ON CONFLICT (key) DO UPDATE
SET
	value = EXCLUDED.value,
	updated_at = NOW();
