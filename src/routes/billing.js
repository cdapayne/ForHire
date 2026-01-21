/**
 * Billing Routes
 *
 * Handles subscription management, checkout, and payment webhooks
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const {
  createSquareCheckout,
  createPayPalCheckout,
  activateSubscription,
  cancelSubscription,
  getSubscription,
  handleSquareWebhook,
  handlePayPalWebhook,
} = require("../services/billingService");
const { getUserUsage } = require("../services/userService");
const { getAllPlans } = require("../config/plans");

/**
 * GET /billing - Billing dashboard page
 */
router.get("/billing", requireAuth, async (req, res) => {
  try {
    const subscription = await getSubscription(req.userId);
    const usage = await getUserUsage(req.userId);
    const plans = getAllPlans();

    res.render("auth/billing", {
      user: req.user,
      subscription,
      usage,
      plans,
    });
  } catch (error) {
    console.error("Billing page error:", error);
    res.status(500).send("Error loading billing page");
  }
});

/**
 * GET /billing/plans - Get available plans
 */
router.get("/billing/plans", (req, res) => {
  const plans = getAllPlans();
  res.json({
    success: true,
    plans,
  });
});

/**
 * POST /billing/checkout - Create checkout session
 */
router.post("/billing/checkout", requireAuth, async (req, res) => {
  try {
    const { plan, provider } = req.body;

    if (!plan || !["starter", "pro", "enterprise"].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan selected",
      });
    }

    if (!provider || !["square", "paypal"].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment provider",
      });
    }

    const redirectUrl = `${req.protocol}://${req.get("host")}/billing/success`;

    let checkout;
    if (provider === "square") {
      checkout = await createSquareCheckout(req.userId, plan, redirectUrl);
    } else {
      checkout = await createPayPalCheckout(req.userId, plan, redirectUrl);
    }

    res.json({
      success: true,
      checkout,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create checkout session",
    });
  }
});

/**
 * GET /billing/success - Payment success callback
 */
router.get("/billing/success", requireAuth, async (req, res) => {
  try {
    const { plan, provider, subscription_id } = req.query;

    if (plan && provider) {
      // Activate the subscription
      await activateSubscription(
        req.userId,
        provider,
        subscription_id || `manual_${Date.now()}`,
        plan,
      );
    }

    res.render("auth/billing-success", {
      user: req.user,
      plan,
    });
  } catch (error) {
    console.error("Payment success handling error:", error);
    res.redirect("/billing?error=payment_failed");
  }
});

/**
 * POST /billing/cancel - Cancel subscription
 */
router.post("/billing/cancel", requireAuth, async (req, res) => {
  try {
    const result = await cancelSubscription(req.userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel subscription",
    });
  }
});

/**
 * GET /billing/subscription - Get current subscription
 */
router.get("/billing/subscription", requireAuth, async (req, res) => {
  try {
    const subscription = await getSubscription(req.userId);
    const usage = await getUserUsage(req.userId);

    res.json({
      success: true,
      subscription,
      usage,
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get subscription",
    });
  }
});

// ============================================
// Payment Provider Webhooks
// ============================================

/**
 * POST /webhooks/square - Square webhook endpoint
 */
router.post(
  "/webhooks/square",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      // In production, verify the webhook signature:
      // const signature = req.headers['x-square-signature'];
      // const isValid = verifySquareWebhookSignature(req.body, signature);

      const event = JSON.parse(req.body.toString());
      await handleSquareWebhook(event);

      res.json({ received: true });
    } catch (error) {
      console.error("Square webhook error:", error);
      res.status(400).json({ error: "Webhook handling failed" });
    }
  },
);

/**
 * POST /webhooks/paypal - PayPal webhook endpoint
 */
router.post(
  "/webhooks/paypal",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      // In production, verify the webhook signature:
      // const isValid = await verifyPayPalWebhookSignature(req);

      const event = JSON.parse(req.body.toString());
      await handlePayPalWebhook(event);

      res.json({ received: true });
    } catch (error) {
      console.error("PayPal webhook error:", error);
      res.status(400).json({ error: "Webhook handling failed" });
    }
  },
);

module.exports = router;
