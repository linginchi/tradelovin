"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  nextPath?: string | null;
};

export function GoogleLoginButton({ nextPath }: Props) {
  const t = useTranslations("MagicLogin");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function onGoogleLogin() {
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      toast.error(t("sendFailed"));
      return;
    }
    setBusy(true);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
      redirectTo.searchParams.set("next", nextPath);
    } else {
      redirectTo.searchParams.set("next", "/courses");
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(locale === "en" ? "Google sign-in failed" : t("googleLoginFailed"));
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void onGoogleLogin()} disabled={busy}>
      {busy ? t("googleLoggingIn") : t("googleLogin")}
    </Button>
  );
}
