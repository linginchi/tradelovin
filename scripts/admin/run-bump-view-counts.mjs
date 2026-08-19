/**
 * 本地补跑 view_count 动态日增（幂等，跳过已写入日期）
 *
 * 用法：node scripts/admin/run-bump-view-counts.mjs
 */
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
if (!url || !key) throw new Error("Missing SUPABASE env in .env.local");

// 动态 import TS 模块（需 tsx）
const { bumpViewCountsCatchUp } = await import("../../src/lib/analytics/bump-view-counts.ts");
const srv = createClient(url, key, { auth: { persistSession: false } });

const result = await bumpViewCountsCatchUp(srv);
console.log(JSON.stringify(result, null, 2));
