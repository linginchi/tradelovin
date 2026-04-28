-- Instruction 88: align public.profiles with app (add fields, migrate full_name → real_name, drop email/full_name)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS real_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_experience TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_style_preferences TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS learning_goals TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS willing_to_recommend BOOLEAN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'profiles'
			AND column_name = 'full_name'
	) THEN
		UPDATE public.profiles p
		SET real_name = p.full_name
		WHERE p.full_name IS NOT NULL
			AND btrim(p.full_name) <> ''
			AND (p.real_name IS NULL OR btrim(COALESCE(p.real_name, '')) = '');
	END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;
