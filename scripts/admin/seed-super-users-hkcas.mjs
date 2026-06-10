// 一次性种子：为 hkcas 超级用户设置 100 万积分并升 T3（等价于 20260610092500 迁移，幂等）
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(new URL("../../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
	envText
		.split(/\r?\n/)
		.filter((l) => l && !l.startsWith("#") && l.includes("="))
		.map((l) => {
			const i = l.indexOf("=");
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
		}),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE env");

const srv = createClient(url, key, { auth: { persistSession: false } });
const EMAILS = ["william.hu@hkcas.org", "lin@hkcas.org"];
const REF = "super-user-seed-1000000";

async function findUserByEmail(email) {
	let page = 1;
	for (;;) {
		const { data, error } = await srv.auth.admin.listUsers({ page, perPage: 1000 });
		if (error) throw error;
		const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
		if (hit) return hit;
		if (data.users.length < 1000) return null;
		page += 1;
	}
}

for (const email of EMAILS) {
	const user = await findUserByEmail(email);
	if (!user) {
		console.log(`SKIP ${email}: not found in auth.users (需先注册)`);
		continue;
	}
	const uid = user.id;

	const { error: e1 } = await srv.from("user_points").upsert(
		{ user_id: uid, balance: 1000000, total_earned: 1000000, total_spent: 0, updated_at: new Date().toISOString() },
		{ onConflict: "user_id" },
	);
	if (e1) throw new Error(`user_points ${email}: ${e1.message}`);

	const { data: pt } = await srv
		.from("points_transactions")
		.select("id")
		.eq("user_id", uid)
		.eq("reference_id", REF)
		.limit(1);
	if (!pt?.length) {
		const { error: e2 } = await srv.from("points_transactions").insert({
			user_id: uid,
			amount: 1000000,
			type: "earn",
			reason: "admin_adjust",
			reference_id: REF,
			metadata: { note: "super user seed" },
		});
		if (e2) throw new Error(`points_transactions ${email}: ${e2.message}`);
	}

	const { data: lg } = await srv
		.from("tq_points_ledger")
		.select("id")
		.eq("user_id", uid)
		.eq("reference_id", REF)
		.limit(1);
	if (!lg?.length) {
		const { error: e3 } = await srv.from("tq_points_ledger").insert({
			user_id: uid,
			change_type: "adjust",
			source: "admin_adjust",
			delta: 1000000,
			balance_after: 1000000,
			reference_id: REF,
			metadata: { note: "super user seed" },
		});
		if (e3) throw new Error(`tq_points_ledger ${email}: ${e3.message}`);
	}

	const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
	const { error: e4 } = await srv.from("user_memberships").upsert(
		{
			user_id: uid,
			plan: "T3",
			status: "active",
			trial_end: null,
			current_period_start: new Date().toISOString(),
			current_period_end: farFuture,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "user_id" },
	);
	if (e4) throw new Error(`user_memberships ${email}: ${e4.message}`);

	console.log(`OK ${email} -> ${uid}: points=1000000, plan=T3 active`);
}
console.log("DONE");
