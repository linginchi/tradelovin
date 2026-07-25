-- ============================================================
-- 辅助函数：增加 channel_partners.total_paid（与 total_earned 模式一致）
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_channel_partner_total_paid(
  p_partner_id UUID,
  p_amount DECIMAL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.channel_partners
  SET total_paid = COALESCE(total_paid, 0) + p_amount,
      updated_at = NOW()
  WHERE id = p_partner_id;
END;
$$;
