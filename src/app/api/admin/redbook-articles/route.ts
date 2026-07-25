import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ error: "服务不可用" }, { status: 503 });

  const { data: articles, error } = await srv
    .from("ai_redbook_articles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ articles: articles ?? [] });
}

export async function PATCH(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ error: "服务不可用" }, { status: 503 });

  let body: { id: string; status: "reviewed" | "published" };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (!body.id || !["reviewed", "published"].includes(body.status)) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
  if (body.status === "published") updates.published_at = new Date().toISOString();

  const { error } = await srv.from("ai_redbook_articles").update(updates).eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
