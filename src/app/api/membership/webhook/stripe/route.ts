import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeClient, resolvePlanByPriceId } from "@/lib/billing/stripe";
import { activateMembership, cycleToPeriod } from "@/lib/membership/activate";
import { recordPaymentTransaction } from "@/lib/membership/payments";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function markWebhookProcessed(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<"new" | "duplicate" | "error"> {
  const srv = getServiceSupabase();
  if (!srv) return "error";
  const { error } = await srv.from("webhook_events").insert({
    provider: "stripe",
    event_id: eventId,
    event_type: eventType,
    payload,
    processed: false,
  });
  if (!error) return "new";
  if ((error as { code?: string }).code === "23505") return "duplicate";
  return "error";
}

async function finalizeWebhook(eventId: string): Promise<void> {
  const srv = getServiceSupabase();
  if (!srv) return;
  await srv
    .from("webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("provider", "stripe")
    .eq("event_id", eventId);
}

function amountFromCents(cents: number | null | undefined): number {
  return Number(cents ?? 0) / 100;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = (invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

async function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metadataUser = subscription.metadata?.userId;
  if (metadataUser) return metadataUser;

  const srv = getServiceSupabase();
  if (!srv) return null;
  const { data } = await srv
    .from("user_memberships")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const srv = getServiceSupabase();
  if (!srv) return;

  const userId = await resolveUserIdFromSubscription(subscription);
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return;
  const resolved = resolvePlanByPriceId(priceId);
  if (!resolved) return;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodFields = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  await activateMembership(srv, {
    userId,
    plan: resolved.plan,
    period: cycleToPeriod(resolved.cycle),
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });

  await srv
    .from("user_memberships")
    .update({
      current_period_start: new Date(
        (periodFields.current_period_start ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString(),
      current_period_end: new Date(
        (periodFields.current_period_end ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString(),
      status: subscription.status === "active" ? "active" : "paused",
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    })
    .eq("user_id", userId);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "missing webhook secret" }, { status: 503 });
  }
  if (!getServiceSupabase()) {
    return NextResponse.json({ success: false, error: "service unavailable" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ success: false, error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "invalid signature",
      },
      { status: 400 },
    );
  }

  const mark = await markWebhookProcessed(event.id, event.type, event.data.object);
  if (mark === "duplicate") {
    return NextResponse.json({ success: true, duplicate: true });
  }
  if (mark === "error") {
    return NextResponse.json({ success: false, error: "webhook persistence failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        if (subscriptionId && userId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id ?? "";
          const resolved = resolvePlanByPriceId(priceId);
          if (resolved) {
            await activateMembership(getServiceSupabase()!, {
              userId,
              plan: resolved.plan,
              period: cycleToPeriod(resolved.cycle),
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId,
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            });
          }
        }
        if (userId) {
          await recordPaymentTransaction(getServiceSupabase()!, {
            userId,
            orderId: session.id,
            gateway: "stripe",
            amount: amountFromCents(session.amount_total),
            currency: (session.currency ?? "hkd").toUpperCase(),
            status: "completed",
            metadata: {
              checkoutSessionId: session.id,
              subscriptionId,
              customerId,
            },
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = await resolveUserIdFromSubscription(sub);
          await handleSubscriptionUpdated(sub);
          await recordPaymentTransaction(getServiceSupabase()!, {
            userId,
            orderId: invoice.id,
            gateway: "stripe",
            amount: amountFromCents(invoice.amount_paid ?? invoice.amount_due),
            currency: (invoice.currency ?? "hkd").toUpperCase(),
            status: "paid",
            metadata: { subscriptionId },
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = await resolveUserIdFromSubscription(sub);
          await recordPaymentTransaction(getServiceSupabase()!, {
            userId,
            orderId: invoice.id,
            gateway: "stripe",
            amount: amountFromCents(invoice.amount_due),
            currency: (invoice.currency ?? "hkd").toUpperCase(),
            status: "failed",
            metadata: { subscriptionId },
          });
          if (userId) {
            await getServiceSupabase()
              ?.from("user_memberships")
              .update({ cancel_at_period_end: true })
              .eq("user_id", userId);
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(sub);
        if (userId) {
          await getServiceSupabase()
            ?.from("user_memberships")
            .update({
              status: "expired",
              cancel_at_period_end: false,
              stripe_subscription_id: null,
            })
            .eq("user_id", userId);
        }
        break;
      }
      default:
        break;
    }
    await finalizeWebhook(event.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "webhook handler failed",
      },
      { status: 500 },
    );
  }
}
