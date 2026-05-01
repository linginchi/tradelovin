import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeClient, resolvePlanByPriceId } from "@/lib/billing/stripe";
import {
  applyMembershipCancelAtPeriodEnd,
  applyPaidMembershipFromStripe,
  downgradeToT0Paid,
} from "@/lib/membership/subscription";
import { settleReferralOnFirstPayment } from "@/lib/referral/service";
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

async function savePayment(
  userId: string | null,
  invoice: Stripe.Invoice,
  status: "paid" | "failed" | "pending",
): Promise<void> {
  const srv = getServiceSupabase();
  if (!srv) return;
  const firstLine = invoice.lines.data[0] as Stripe.InvoiceLineItem & {
    price?: Stripe.Price | null;
  };
  await srv.from("payments").upsert(
    {
      user_id: userId,
      amount: invoice.amount_paid ? invoice.amount_paid / 100 : invoice.amount_due / 100,
      currency: (invoice.currency ?? "cny").toUpperCase(),
      plan: firstLine?.price?.nickname ?? null,
      payment_method: "stripe",
      transaction_id: invoice.id,
      status,
      provider: "stripe",
      metadata: {
        customer: invoice.customer,
        subscription: invoice.subscription,
      },
    },
    { onConflict: "transaction_id" },
  );
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
  const userId = await resolveUserIdFromSubscription(subscription);
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return;
  const resolved = resolvePlanByPriceId(priceId);
  if (!resolved) return;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  await applyPaidMembershipFromStripe(getServiceSupabase()!, {
    userId,
    plan: resolved.plan,
    cycle: resolved.cycle,
    periodStart: subscription.current_period_start,
    periodEnd: subscription.current_period_end,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    status: subscription.status === "active" ? "active" : "paused",
  });
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
        if (session.subscription && session.metadata?.userId) {
          const srv = getServiceSupabase();
          await srv
            ?.from("user_memberships")
            .update({
              stripe_subscription_id:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription.id,
              stripe_customer_id:
                typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
            })
            .eq("user_id", session.metadata.userId);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = await resolveUserIdFromSubscription(sub);
          await handleSubscriptionUpdated(sub);
          await savePayment(userId, invoice, "paid");
          if (userId) {
            await settleReferralOnFirstPayment(getServiceSupabase()!, {
              refereeId: userId,
              paymentId: invoice.id,
            });
          }
        } else {
          await savePayment(null, invoice, "paid");
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = await resolveUserIdFromSubscription(sub);
          await savePayment(userId, invoice, "failed");
          if (userId) {
            await applyMembershipCancelAtPeriodEnd(getServiceSupabase()!, userId);
          }
        } else {
          await savePayment(null, invoice, "failed");
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
          await downgradeToT0Paid(getServiceSupabase()!, userId);
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
