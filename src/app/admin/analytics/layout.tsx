import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/auth/admin-session";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  setRequestLocale(locale);

  const session = await getAdminSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin" && session.role !== "analytics")) {
    redirect(`/admin/login`);
  }

  return <>{children}</>;
}
