import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const triggerSchema = z.object({
  source_url: z.string().url(),
  course_id: z.string().uuid(),
  source_platform: z.string().optional(),
  topic: z.string().optional(),
});

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ error: "服务不可用" }, { status: 503 });

  const { data: jobs, error } = await srv
    .from("ai_pipeline_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: jobs ?? [] });
}

export async function POST(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ error: "服务不可用" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  const parsed = triggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const { source_url, course_id, source_platform, topic } = parsed.data;

  const { data: course } = await srv.from("courses").select("id").eq("id", course_id).maybeSingle();
  if (!course) return NextResponse.json({ error: "课程不存在" }, { status: 404 });

  const { data: job, error } = await srv
    .from("ai_pipeline_jobs")
    .insert({
      source_url,
      source_platform: source_platform ?? "unknown",
      status: "pending",
      target_course_id: course_id,
    })
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ job });
}
