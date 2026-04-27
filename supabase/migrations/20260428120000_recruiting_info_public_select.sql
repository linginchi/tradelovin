-- 公开读：首页 /api/recruiting 在仅配置 anon 时可 SELECT（RLS 仍禁止匿名写入）
DROP POLICY IF EXISTS recruiting_info_select_public ON public.recruiting_info;

CREATE POLICY recruiting_info_select_public
	ON public.recruiting_info
	FOR SELECT
	TO anon, authenticated
	USING (true);
