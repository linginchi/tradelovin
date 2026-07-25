import { NextResponse } from "next/server";
import { z } from "zod";

import { signAdminToken, type AdminRole } from "@/lib/auth/admin-jwt";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json(
      { success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求体格式错误" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "请提供有效邮箱和密码" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  // 查询用户 admin 角色
  const { data: adminRow, error: adminErr } = await srv
    .from("admins")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (adminErr || !adminRow) {
    return NextResponse.json(
      { success: false, error: "该邮箱无管理员权限" },
      { status: 403 },
    );
  }

  const role = String(adminRow.role ?? "").toLowerCase() as AdminRole | "";
  if (role !== "super_admin" && role !== "admin" && role !== "analytics") {
    return NextResponse.json(
      { success: false, error: "该邮箱无管理员权限" },
      { status: 403 },
    );
  }

  // 验证密码
  const { error: signInErr } = await srv.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (signInErr) {
    console.warn("[admin-login signIn]", signInErr.message);
    return NextResponse.json(
      { success: false, error: "邮箱或密码错误" },
      { status: 401 },
    );
  }

  // 签发 admin cookie
  const adminToken = await signAdminToken({ email, role });
  const response = NextResponse.json({ success: true, role });
  response.cookies.set(ADMIN_TOKEN_COOKIE, adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
