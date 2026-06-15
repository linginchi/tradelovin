import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const generateSchema = z.object({
  count: z.number().int().min(1).max(20).default(1),
});

function randomInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: rows, error } = await srv
    .from("kol_invite_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { rows } });
}

export async function POST(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数错误: " + parsed.error.message },
      { status: 400 },
    );
  }

  const codes: string[] = [];
  for (let i = 0; i < parsed.data.count; i++) {
    codes.push(randomInviteCode());
  }

  const { error } = await srv.from("kol_invite_codes").insert(
    codes.map((code) => ({
      code,
      created_by: gated.session.email,
      status: "active",
    })),
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { codes } }, { status: 201 });
}
