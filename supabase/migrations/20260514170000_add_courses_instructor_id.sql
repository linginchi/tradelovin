ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_instructor_id_idx ON public.courses(instructor_id);
