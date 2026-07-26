-- Production schema/history drift reconciliation for course_topics.
--
-- Background:
--   20260725100000_course_topics.sql remains the original owner of the topics
--   table contract (CREATE TABLE IF NOT EXISTS with inline title CHECK, topic_id
--   FK, index, ENABLE RLS). Production already had course_topics from an
--   out-of-band apply, so CREATE TABLE IF NOT EXISTS could not install the
--   title non-empty CHECK, and a legacy policy "public read active topics"
--   remained. This file only reconciles those gaps; it does not edit #2.
--
-- Product decisions for this release:
--   - Add CHECK (char_length(btrim(title)) > 0) when missing.
--   - Drop policy "public read active topics".
--   - Do NOT alter view_count INTEGER → BIGINT.
--   - Do NOT modify content_kind or existing rows.

-- Fail loud if any existing title is blank / whitespace-only. Never silently
-- rewrite or delete topic rows.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.course_topics
		WHERE char_length(btrim(title)) = 0
	) THEN
		RAISE EXCEPTION
			'reconcile_course_topics_contract: cannot add title CHECK — one or more course_topics.title values are blank or whitespace-only; fix data manually before re-running';
	END IF;
END
$$;

-- Idempotent CHECK: bind to public.course_topics specifically (not name-only).
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'course_topics_title_nonempty'
			AND conrelid = 'public.course_topics'::regclass
	) THEN
		ALTER TABLE public.course_topics
			ADD CONSTRAINT course_topics_title_nonempty
			CHECK (char_length(btrim(title)) > 0);
	END IF;
END
$$;

-- Remove the legacy public read policy; safe to re-run.
DROP POLICY IF EXISTS "public read active topics" ON public.course_topics;
