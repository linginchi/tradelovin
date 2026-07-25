import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: "无效的任务 ID" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ error: "服务不可用" }, { status: 503 });

  const { data, error } = await srv
    .from("ai_pipeline_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  return NextResponse.json({ job: data });
}
