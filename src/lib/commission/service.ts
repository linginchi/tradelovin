import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 学员首次付款后，检查是否由 KOL 引入，若是则创建分佣记录。
 */
export async function createCommissionRecord(
  supabase: SupabaseClient,
  input: {
    refereeId: string;
    paymentTransactionId: string;
    tuitionAmount: number;
  },
): Promise<void> {
  // 1. 查找 referral 是否有 partner_id
  const { data: referral } = await supabase
    .from("referrals")
    .select("id,partner_id")
    .eq("referee_id", input.refereeId)
    .not("partner_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!referral?.partner_id) return;

  // 2. 查 KOL 分佣比例
  const { data: partner } = await supabase
    .from("channel_partners")
    .select("commission_rate")
    .eq("id", referral.partner_id)
    .single();

  if (!partner) return;

  const rate = Number(partner.commission_rate);
  const commissionAmount = Math.round(input.tuitionAmount * rate * 100) / 100;

  // 3. 写入分佣记录
  await supabase.from("commission_records").insert({
    partner_id: referral.partner_id,
    referral_id: referral.id,
    student_user_id: input.refereeId,
    payment_transaction_id: input.paymentTransactionId,
    tuition_amount: input.tuitionAmount,
    commission_rate: rate,
    commission_amount: commissionAmount,
    status: "pending",
  });

  // 4. 更新 KOL 累计收益
  const { error: rpcError } = await supabase.rpc(
    "increment_channel_partner_total_earned",
    {
      p_partner_id: referral.partner_id,
      p_amount: commissionAmount,
    },
  );
  if (rpcError) {
    console.error("[commission] rpc increment failed", rpcError);
  }

  // 5. 更新 referral 状态
  await supabase
    .from("referrals")
    .update({ status: "completed_commission", commission_paid: commissionAmount })
    .eq("id", referral.id);
}

/**
 * 锁定超过 7 天退款保护期的 pending 分佣记录。
 * 返回锁定的记录数。
 */
export async function lockCommissions(supabase: SupabaseClient): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("commission_records")
    .update({ status: "locked" })
    .eq("status", "pending")
    .lt("created_at", sevenDaysAgo)
    .select("id");

  if (error) {
    console.error("[commission] lockCommissions error", error);
    throw error;
  }
  return (data ?? []).length;
}

/**
 * 按月汇总 locked 的分佣记录，生成 commission_payouts 月结单。
 * 返回生成的月结单数量。
 */
export async function settleMonthlyCommissions(
  supabase: SupabaseClient,
  settlementMonth: string,
): Promise<number> {
  // 1. 取出所有未入月结的 locked 记录
  const { data: records } = await supabase
    .from("commission_records")
    .select("partner_id, commission_amount")
    .eq("status", "locked")
    .is("settlement_month", null);

  if (!records || records.length === 0) return 0;

  // 按 partner_id 分组汇总
  const partnerTotals = new Map<string, number>();
  for (const row of records) {
    const pid = row.partner_id as string;
    const current = partnerTotals.get(pid) ?? 0;
    partnerTotals.set(pid, current + Number(row.commission_amount));
  }

  // 2. 批量生成月结单
  const payoutInserts = Array.from(partnerTotals.entries()).map(([partnerId, total]) => ({
    partner_id: partnerId,
    settlement_month: settlementMonth,
    total_commission: Math.round(total * 100) / 100,
    status: "pending" as const,
  }));

  if (payoutInserts.length > 0) {
    const { error: insertError } = await supabase
      .from("commission_payouts")
      .insert(payoutInserts);
    if (insertError) {
      console.error("[commission] settleMonthlyCommissions insert error", insertError);
      throw insertError;
    }
  }

  // 3. 标记 commission_records 已入月结
  const { error: updateError } = await supabase
    .from("commission_records")
    .update({ settlement_month: settlementMonth })
    .eq("status", "locked")
    .is("settlement_month", null);

  if (updateError) {
    console.error("[commission] settleMonthlyCommissions update error", updateError);
    throw updateError;
  }

  return payoutInserts.length;
}
