import { NextResponse } from "next/server";

import { bumpViewCountsCatchUp } from "@/lib/analytics/bump-view-counts";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const internal = process.env.INTERNAL_WEBHOOK_TOKEN;
  const cronKey = process.env.VIEW_COUNT_CRON_KEY ?? process.env.TQ_CRON_API_KEY;
  const token = request.headers.get("x-internal-token");
  const cron = request.headers.get("x-cron-key");

  // 未配置密钥时仅允许非 production（本地调试）
  if (!internal && !cronKey) {
    return process.env.NODE_ENV !== "production";
  }
  if (internal && token === internal) return true;
  if (cronKey && cron === cronKey) return true;
  return false;
}

/** POST/GET：按动态日增模型补跑并写入 course_videos.view_count */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
  }

  try {
    const data = await bumpViewCountsCatchUp(srv);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "bump failed";
    console.error("[cron/bump-view-counts]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
