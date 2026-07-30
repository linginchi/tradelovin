import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/auth/admin-session";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  setRequestLocale(locale);

  const session = await getAdminSession();
  if (session) {
    // 已登录用户访问登录页，统一跳转到数据分析仪表盘
    redirect("/admin/analytics");
  }

  return <>{children}</>;
}
