-- 快速下单快捷键与移动端股数预设

ALTER TABLE public.tq_user_trade_prefs
ADD COLUMN IF NOT EXISTS quick_order_prefs JSONB NOT NULL DEFAULT '{
  "hotkeys": {"buy": "b", "sell": "s", "close": "c", "qtyUp": "+", "qtyDown": "-", "qtyReset": "0"},
  "qtyPresets": [100, 500, 1000]
}'::jsonb;
