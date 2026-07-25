import { NextResponse } from "next/server";
import { z } from "zod";

import { signAdminToken } from "@/lib/auth/admin-jwt";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "DEV_LOGIN_DISABLED" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return NextResponse.json(
      { error: "请提供 ?email= 参数" },
      { status: 400 },
    );
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: adminRow } = await srv
    .from("admins")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json(
      { error: `邮箱 ${email} 无管理员权限，请先在 Supabase admins 表添加` },
      { status: 404 },
    );
  }

  const role = String(adminRow.role ?? "admin").toLowerCase();
  if (role !== "super_admin" && role !== "admin" && role !== "analytics") {
    return NextResponse.json(
      { error: `邮箱 ${email} 的角色为 ${role}，无管理权限` },
      { status: 403 },
    );
  }

  const token = await signAdminToken({ email, role: role as "super_admin" | "admin" | "analytics" });
  const resp = NextResponse.redirect(new URL("/cjkzt/courses", request.url));
  resp.cookies.set(ADMIN_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return resp;
}
