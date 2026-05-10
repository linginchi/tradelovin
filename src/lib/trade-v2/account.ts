import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";

type ProductRow = { id: string };

type AccountRow = {
	id: string;
	user_id: string;
	product_id: string;
	account_type: "normal" | "credit";
	account_name: string;
	available_balance: string | number;
	frozen_balance: string | number;
	credit_limit: string | number;
	status: "active" | "disabled" | "closed";
};

export async function getStockProductId(supabase: SupabaseClient): Promise<string | null> {
	const { data, error } = await supabase
		.from("tq_products")
		.select("id")
		.eq("code", "STOCK_CN")
		.maybeSingle();
	if (!error && data) return (data as ProductRow).id;

	// 优先尝试当前会话直接补齐产品（在放开写权限的环境可生效）。
	await supabase.from("tq_products").insert({
		code: "STOCK_CN",
		name: "A股模拟交易",
	});
	const { data: localRetried, error: localRetryErr } = await supabase
		.from("tq_products")
		.select("id")
		.eq("code", "STOCK_CN")
		.maybeSingle();
	if (!localRetryErr && localRetried) return (localRetried as ProductRow).id;

	const service = getServiceSupabase();
	if (!service) return null;

	const { data: created } = await service
		.from("tq_products")
		.insert({
			code: "STOCK_CN",
			name: "A股模拟交易",
		})
		.select("id")
		.maybeSingle();
	if (created) return (created as ProductRow).id;

	const { data: retried, error: retryErr } = await supabase
		.from("tq_products")
		.select("id")
		.eq("code", "STOCK_CN")
		.maybeSingle();
	if (retryErr || !retried) return null;
	return (retried as ProductRow).id;
}

export async function getOrCreateTqProductAccount(
	supabase: SupabaseClient,
	userId: string,
	accountType: "normal" | "credit" = "normal",
): Promise<{ data: AccountRow | null; error: Error | null }> {
	const productId = await getStockProductId(supabase);
	if (!productId) {
		return { data: null, error: new Error("交易产品未初始化") };
	}

	const { data: existing, error: readErr } = await supabase
		.from("tq_product_accounts")
		.select("*")
		.eq("user_id", userId)
		.eq("product_id", productId)
		.eq("account_type", accountType)
		.maybeSingle();

	if (existing && !readErr) {
		return { data: existing as AccountRow, error: null };
	}

	const { data: created, error: createErr } = await supabase
		.from("tq_product_accounts")
		.insert({
			user_id: userId,
			product_id: productId,
			account_type: accountType,
			account_name: accountType === "credit" ? "信用账户" : "普通账户",
			available_balance: 100000,
			frozen_balance: 0,
			credit_limit: accountType === "credit" ? 50000 : 0,
			status: "active",
		})
		.select("*")
		.single();

	if (createErr || !created) {
		return { data: null, error: new Error(createErr?.message ?? "创建账户失败") };
	}

	return { data: created as AccountRow, error: null };
}
