-- 委托冻结明细：便于撤单时精确解冻；历史行可为 NULL（按旧逻辑无法撤单或由应用忽略）
ALTER TABLE public.sim_orders
	ADD COLUMN IF NOT EXISTS reserved_cash NUMERIC (12, 2),
	ADD COLUMN IF NOT EXISTS reserved_shares INTEGER;

COMMENT ON COLUMN public.sim_orders.reserved_cash IS '买入挂单时冻结资金（限价单预估上限）；撤单回原额释放';
COMMENT ON COLUMN public.sim_orders.reserved_shares IS '卖出挂单时冻结的可卖数量；撤单回滚';
