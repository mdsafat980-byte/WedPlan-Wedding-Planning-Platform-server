import { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { asyncHandler, HttpError } from "../middleware/error.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { FREE_ACTIVE_SERVICE_LIMIT, effectivePlan, isPremium } from "../utils/serializers.js";
import { Service } from "../models/Service.js";

export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth, requireRole("vendor"));

let stripeClient = null;
export function getStripe() {
  if (!stripeClient) {
    if (!env.stripeSecretKey) return null;
    stripeClient = new Stripe(env.stripeSecretKey);
  }
  return stripeClient;
}

const isStripeReady = () =>
  Boolean(env.stripeSecretKey && env.stripePremiumPriceId);

subscriptionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeServices = await Service.countDocuments({
      vendorId: req.user._id,
      status: "approved",
      isActive: true,
    });
    res.json({
      plan: effectivePlan(req.user),
      subscriptionPlan: req.user.subscriptionPlan,
      subscriptionExpiresAt: req.user.subscriptionExpiresAt,
      activeServices,
      freeLimit: FREE_ACTIVE_SERVICE_LIMIT,
      premium: {
        price: 49,
        currency: "usd",
        interval: "month",
        features: [
          "Unlimited active service listings",
          "Premium vendor badge on every listing",
          "Priority placement in search results",
          "All Free plan features",
        ],
      },
      stripeReady: isStripeReady(),
    });
  }),
);

subscriptionRouter.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    if (isPremium(req.user)) {
      throw new HttpError(409, "Your Premium subscription is already active");
    }
    if (!isStripeReady()) {
      throw new HttpError(
        503,
        "Stripe is not configured on this environment. Add STRIPE_SECRET_KEY and STRIPE_PREMIUM_PRICE_ID to enable checkout.",
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: req.user.email,
      line_items: [{ price: env.stripePremiumPriceId, quantity: 1 }],
      success_url: `${env.clientUrl}/dashboard/vendor/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.clientUrl}/dashboard/vendor/payment-cancel`,
      client_reference_id: String(req.user._id),
      metadata: { vendorId: String(req.user._id), plan: "premium" },
      subscription_data: {
        metadata: { vendorId: String(req.user._id), plan: "premium" },
      },
      allow_promotion_codes: true,
    });

    await Transaction.create({
      vendorId: req.user._id,
      plan: "premium",
      amount: session.amount_total || 0,
      currency: session.currency || "usd",
      stripeSessionId: session.id,
      stripeSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : "",
      status: "pending",
    });

    res.json({ url: session.url, sessionId: session.id });
  }),
);

function subscriptionPeriodEnd(subscription) {
  const itemEnd = subscription?.items?.data?.[0]?.current_period_end;
  const raw = itemEnd || subscription?.current_period_end;
  return raw ? new Date(raw * 1000) : null;
}

async function activatePremium(vendorId, subscription) {
  if (!vendorId) return;
  const expiresAt = subscriptionPeriodEnd(subscription);
  await User.findByIdAndUpdate(vendorId, {
    subscriptionPlan: "premium",
    subscriptionExpiresAt: expiresAt,
  });
}

async function deactivatePremium(vendorId) {
  if (!vendorId) return;
  await User.findByIdAndUpdate(vendorId, {
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
  });
}

/** Express handler - must be mounted with express.raw({ type: "application/json" }). */
export async function stripeWebhookHandler(req, res) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    return res.status(503).json({ message: "Stripe webhook is not configured" });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      env.stripeWebhookSecret,
    );
  } catch (error) {
    console.error("[stripe] signature verification failed:", error.message);
    return res.status(400).json({ message: "Invalid Stripe signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status !== "paid") break;
        const vendorId = session.metadata?.vendorId || session.client_reference_id;
        if (!vendorId) break;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : "";
        let subscription = null;
        if (subscriptionId) {
          try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
          } catch (error) {
            console.error("[stripe] could not retrieve subscription:", error.message);
          }
        }

        await Transaction.findOneAndUpdate(
          { stripeSessionId: session.id },
          {
            $set: {
              vendorId,
              plan: "premium",
              amount: session.amount_total || 0,
              currency: session.currency || "usd",
              stripeSubscriptionId: subscriptionId,
              status: "paid",
              paidAt: new Date(),
            },
            $setOnInsert: { stripeSessionId: session.id },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        await activatePremium(vendorId, subscription);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        await Transaction.findOneAndUpdate(
          { stripeSessionId: session.id, status: "pending" },
          { $set: { status: "expired" } },
        );
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendorId;
        if (!vendorId) break;
        if (["active", "trialing"].includes(subscription.status)) {
          await activatePremium(vendorId, subscription);
        } else if (["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
          await deactivatePremium(vendorId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await deactivatePremium(subscription.metadata?.vendorId);
        break;
      }

      case "invoice.payment_failed": {
        // Access is not revoked here: Stripe retries the invoice. A cancelled
        // subscription event will downgrade the vendor if retries fail.
        console.warn("[stripe] invoice payment failed for customer", event.data.object.customer);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("[stripe] webhook handling failed:", error);
    // Returning 500 makes Stripe retry the event.
    return res.status(500).json({ message: "Webhook processing failed" });
  }

  return res.json({ received: true });
}
