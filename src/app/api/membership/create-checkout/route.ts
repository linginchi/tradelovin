import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { activateMembership } from "@/lib/membership/activate";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getStripePriceIdByPlan } from "@/lib/membership/plans";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["T1", "T2", "T3"]),
  period: z.enum(["monthly", "yearly"]).default("monthly"),
});

function resolveAppUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      if (process.env.NODE_ENV === "production") {
        configuredUrl.protocol = "https:";
      }
      return configuredUrl.toString().replace(/\/$/, "");
    } catch {
      // ignore invalid configured URL and fallback to request URL
    }
  }
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production") {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto === "https") {
      url.protocol = "https:";
    }
  }
  return `${url.protocol}//${url.host}`;
}

function normalizeStripeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes("Missing required env")) {
      const missing = error.message.replace("Missing required env:", "").trim();
      if (missing.includes("STRIPE_SECRET_KEY")) {
        return "支付配置缺失：未配置 STRIPE_SECRET_KEY（Cloudflare Worker Secret）";
      }
      return `支付配置缺失：缺少环境变量 ${missing}`;
    }
    if (error.message === "stripe_checkout_session_timeout") {
      return "Stripe响应超时，请稍后重试。";
    }
    return error.message;
  }
  return "创建支付会话失败，请稍后重试";
}

async function hasPaidVideoSubscription(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("course_registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[membership/create-checkout] paid video check failed", {
      userId,
      error: error.message,
    });
    return false;
  }
  return Boolean(data?.id);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function createStripeCheckoutSession(input: {
  secretKey: string;
  priceId: string;
  appUrl: string;
  userId: string;
  plan: "T1" | "T2" | "T3";
  period: "monthly" | "yearly";
  customerId?: string;
  email?: string;
  trialDaysLeft: number;
}): Promise<string> {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", input.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${input.appUrl}/membership?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${input.appUrl}/membership?canceled=true`);
  form.set("client_reference_id", input.userId);
  if (input.customerId) {
    form.set("customer", input.customerId);
  } else if (input.email) {
    form.set("customer_email", input.email);
  }
  form.set("metadata[userId]", input.userId);
  form.set("metadata[plan]", input.plan);
  form.set("metadata[period]", input.period);
  if (input.trialDaysLeft > 0) {
    form.set("subscription_data[trial_period_days]", String(input.trialDaysLeft));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: controller.signal,
    });

    const payload = (await response.json()) as { url?: string; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `stripe_checkout_failed_${response.status}`);
    }
    if (!payload.url) {
      throw new Error("stripe_checkout_missing_url");
    }
    return payload.url;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("stripe_checkout_session_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
  }

  // If user already has paid video subscription entitlement, allow upgrade without extra charge.
  if (await hasPaidVideoSubscription(auth.supabase, auth.userId)) {
    await activateMembership(auth.supabase, {
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
      stripeSubscriptionId: membership.stripeSubscriptionId,
      stripeCustomerId: membership.stripeCustomerId,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    });
    return NextResponse.json({
      success: true,
      sessionUrl: null,
      freeUpgrade: true,
      message: "已检测到视频订阅，已为你免费升级。",
    });
  }

  try {
    const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");
    const priceId = getStripePriceIdByPlan(parsed.data.plan, parsed.data.period);
    const appUrl = resolveAppUrl(request);

    const userResp = await withTimeout(auth.supabase.auth.getUser(), 8000, "supabase_get_user");
    const email = userResp.data.user?.email ?? undefined;

    const trialDaysLeft = membership.trialEnd
      ? Math.floor((new Date(membership.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;

    const sessionUrl = await createStripeCheckoutSession({
      secretKey: stripeSecretKey,
      priceId,
      appUrl,
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
      customerId: membership.stripeCustomerId ?? undefined,
      email,
      trialDaysLeft,
    });

    return NextResponse.json({ success: true, sessionUrl });
  } catch (error) {
    const message = normalizeStripeErrorMessage(error);
    console.error("[membership/create-checkout] failed", {
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
      error,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
