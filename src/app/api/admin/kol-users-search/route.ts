import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type AuthUser = {
  id: string;
  email: string;
  raw_user_meta_data: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, data: { rows: [] } });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 从 auth.users 搜索用户，需要 service_role key
  const { data: users, error } = await srv.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const lowerQ = q.toLowerCase();
  const filtered = (users?.users ?? []).filter((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    const email = (u.email ?? "").toLowerCase();
    const displayName = String(u.user_metadata?.display_name ?? u.user_metadata?.full_name ?? "").toLowerCase();
    return email.includes(lowerQ) || displayName.includes(lowerQ);
  }).slice(0, 20);

  const rows = filtered.map((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => ({
    id: u.id,
    email: u.email ?? "",
    display_name: String(u.user_metadata?.display_name ?? u.user_metadata?.full_name ?? u.email?.split("@")[0] ?? ""),
  }));

  return NextResponse.json({ success: true, data: { rows } });
}
