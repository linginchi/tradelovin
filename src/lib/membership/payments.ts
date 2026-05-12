import type { SupabaseClient } from "@supabase/supabase-js";

type RecordPaymentInput = {
  userId: string | null;
  orderId: string;
  gateway: "stripe" | "manual";
  amount: number;
  currency?: string;
  status: string;
  metadata?: Record<string, unknown>;
};

export async function recordPaymentTransaction(
  supabase: SupabaseClient,
  input: RecordPaymentInput,
): Promise<void> {
  await supabase.from("payment_transactions").insert({
    user_id: input.userId,
    order_id: input.orderId,
    gateway: input.gateway,
    amount: input.amount,
    currency: (input.currency ?? "HKD").toUpperCase(),
    status: input.status,
    metadata: input.metadata ?? {},
  });
}
