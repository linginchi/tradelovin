-- 资源申请记下批准人；批准即授权按申请数量补足教练库存后再发放。

ALTER TABLE public.tq_resource_requests
	ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tq_resource_requests_reviewed_by_idx
	ON public.tq_resource_requests (reviewed_by)
	WHERE reviewed_by IS NOT NULL;
