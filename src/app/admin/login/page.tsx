import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { AdminPasswordLoginForm } from "@/components/admin/AdminPasswordLoginForm";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default function AdminLoginPage() {
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0f] px-4">
      <Suspense fallback={<p className="text-muted-foreground text-sm">…</p>}>
        <AdminPasswordLoginForm />
      </Suspense>
    </div>
  );
}
