-- Video hub: three front-door topics. Idempotent enough for re-run on title+sort_order.

INSERT INTO public.course_topics (title, description, sort_order, is_active)
SELECT v.title, v.description, v.sort_order, true
FROM (VALUES
  ('交易经典', '豹哥与豹叔经典内容', 10),
  ('录播教学', '系统录播课程', 20),
  ('课程直播', '直播课程敬请期待', 30)
) AS v(title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.course_topics t
  WHERE t.sort_order = v.sort_order AND t.is_active = true AND t.title = v.title
);

-- Ensure the three hub rows are active with expected titles (if sort_order already used).
UPDATE public.course_topics t
SET title = v.title,
    description = v.description,
    is_active = true
FROM (VALUES
  (10, '交易经典', '豹哥与豹叔经典内容'),
  (20, '录播教学', '系统录播课程'),
  (30, '课程直播', '直播课程敬请期待')
) AS v(sort_order, title, description)
WHERE t.sort_order = v.sort_order;

-- Rebind courses by known production IDs.
UPDATE public.courses
SET topic_id = (SELECT id FROM public.course_topics WHERE sort_order = 10 AND is_active = true ORDER BY created_at LIMIT 1)
WHERE id IN (
  '9ea59ef3-2f1f-4d61-be3f-29b7cc664084',
  '78cc57c5-6b1c-462a-b8c6-ed5ceb5e14fb'
);

UPDATE public.courses
SET topic_id = (SELECT id FROM public.course_topics WHERE sort_order = 20 AND is_active = true ORDER BY created_at LIMIT 1)
WHERE id IN (
  '5da6f2fa-4e98-4bcf-ae3a-378da4302b07',
  'cf934e87-90ba-47c5-baab-6c1bf434ddb4',
  '3f9c2852-bb6a-48d1-a22f-51242e253dd5',
  '1f7546e5-0684-4570-953c-686c90800c30',
  '71e9740f-847d-4c3f-97fe-7acf7ea32932'
);

UPDATE public.courses
SET topic_id = NULL
WHERE id = 'c40fbe73-08d7-465a-bacd-9b4d8978dfdf';

-- Deactivate legacy topics that are not the hub trio.
UPDATE public.course_topics
SET is_active = false
WHERE sort_order NOT IN (10, 20, 30)
   OR title IN ('股票交易', '豹哥·交易新銳', '豹叔·交易經典');
