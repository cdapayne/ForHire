/**
 * Billing Service
 *
 * Handles payment processing with Square and PayPal
 *
 * Setup:
 * 1. Square: Get API credentials from https://developer.squareup.com
 * 2. PayPal: Get API credentials from https://developer.paypal.com
 *
 * Add to .env:
 * SQUARE_ACCESS_TOKEN=your_square_access_token
 * SQUARE_LOCATION_ID=your_square_location_id
 * SQUARE_ENVIRONMENT=sandbox (or production)
 *
 * PAYPAL_CLIENT_ID=your_paypal_client_id
 * PAYPAL_CLIENT_SECRET=your_paypal_client_secret
 * PAYPAL_MODE=sandbox (or live)
 */

const { pool } = require("../config/database");
const { getPlan, plans } = require("../config/plans");
const { updateUserPlan } = require("./userService");

// Plan price IDs (you'll set these up in Square/PayPal)
const PLAN_PRICES = {
  square: {
    starter: process.env.SQUARE_PRICE_STARTER || "starter_monthly",
    pro: process.env.SQUARE_PRICE_PRO || "pro_monthly",
    enterprise: process.env.SQUARE_PRICE_ENTERPRISE || "enterprise_monthly",
  },
  paypal: {
    starter: process.env.PAYPAL_PLAN_STARTER || "P-STARTER",
    pro: process.env.PAYPAL_PLAN_PRO || "P-PRO",
    enterprise: process.env.PAYPAL_PLAN_ENTERPRISE || "P-ENTERPRISE",
  },
};

/**
 * Create a checkout session for Square
 */
async function createSquareCheckout(userId, planName, redirectUrl) {
  const plan = getPlan(planName);

  if (!plan || plan.price === 0) {
    throw new Error("Invalid plan for checkout");
  }

  // In production, use Square SDK:
  // const { Client, Environment } = require('square');
  // const client = new Client({
  //     accessToken: process.env.SQUARE_ACCESS_TOKEN,
  //     environment: process.env.SQUARE_ENVIRONMENT === 'production'
  //         ? Environment.Production
  //         : Environment.Sandbox
  // });

  // For now, return a placeholder checkout URL
  // Replace this with actual Square Checkout API integration

  const checkoutData = {
    provider: "square",
    planName,
    price: plan.price,
    userId,
    // This would be the actual checkout URL from Square
    checkoutUrl: `/billing/square/checkout?plan=${planName}&user=${userId}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
  };

  return checkoutData;
}

/**
 * Create a checkout session for PayPal
 */
async function createPayPalCheckout(userId, planName, redirectUrl) {
  const plan = getPlan(planName);

  if (!plan || plan.price === 0) {
    throw new Error("Invalid plan for checkout");
  }

  // In production, use PayPal SDK:
  // const paypal = require('@paypal/checkout-server-sdk');
  // const environment = process.env.PAYPAL_MODE === 'live'
  //     ? new paypal.core.LiveEnvironment(clientId, clientSecret)
  //     : new paypal.core.SandboxEnvironment(clientId, clientSecret);
  // const client = new paypal.core.PayPalHttpClient(environment);

  // For now, return a placeholder checkout URL
  const checkoutData = {
    provider: "paypal",
    planName,
    price: plan.price,
    userId,
    checkoutUrl: `/billing/paypal/checkout?plan=${planName}&user=${userId}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };

  return checkoutData;
}

/**
 * Process successful payment and activate subscription
 */
async function activateSubscription(
  userId,
  provider,
  subscriptionId,
  planName,
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Deactivate any existing subscriptions
    await connection.execute(
      `UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'`,
      [userId],
    );

    // Calculate period dates
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Create new subscription record
    await connection.execute(
      `INSERT INTO subscriptions 
             (user_id, provider, provider_subscription_id, plan, status, current_period_start, current_period_end)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [userId, provider, subscriptionId, planName, now, periodEnd],
    );

    // Update user's plan
    await connection.execute("UPDATE users SET plan = ? WHERE id = ?", [
      planName,
      userId,
    ]);

    await connection.commit();

    return {
      success: true,
      plan: planName,
      periodEnd,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Cancel a subscription
 */
async function cancelSubscription(userId) {
  const connection = await pool.getConnection();

  try {
    // Get active subscription
    const [subs] = await connection.execute(
      `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'`,
      [userId],
    );

    if (subs.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = subs[0];

    // Mark for cancellation at period end
    await connection.execute(
      `UPDATE subscriptions SET cancel_at_period_end = TRUE WHERE id = ?`,
      [subscription.id],
    );

    // In production, also cancel with the payment provider:
    // if (subscription.provider === 'square') { /* Cancel with Square */ }
    // if (subscription.provider === 'paypal') { /* Cancel with PayPal */ }

    return {
      success: true,
      message: "Subscription will be canceled at the end of the billing period",
      cancelAt: subscription.current_period_end,
    };
  } finally {
    connection.release();
  }
}

/**
 * Get user's subscription info
 */
async function getSubscription(userId) {
  const connection = await pool.getConnection();

  try {
    const [subs] = await connection.execute(
      `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (subs.length === 0) {
      return null;
    }

    const sub = subs[0];
    return {
      id: sub.id,
      provider: sub.provider,
      plan: sub.plan,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      createdAt: sub.created_at,
    };
  } finally {
    connection.release();
  }
}

/**
 * Handle webhook from Square
 */
async function handleSquareWebhook(event) {
  const eventType = event.type;
  const data = event.data?.object;

  switch (eventType) {
    case "subscription.created":
    case "subscription.updated":
      // Handle subscription updates
      console.log("Square subscription event:", eventType);
      break;

    case "subscription.canceled":
      // Handle cancellation
      console.log("Square subscription canceled");
      break;

    case "payment.completed":
      // Handle successful payment
      console.log("Square payment completed");
      break;

    case "payment.failed":
      // Handle failed payment
      console.log("Square payment failed");
      break;
  }

  return { received: true };
}

/**
 * Handle webhook from PayPal
 */
async function handlePayPalWebhook(event) {
  const eventType = event.event_type;
  const resource = event.resource;

  switch (eventType) {
    case "BILLING.SUBSCRIPTION.CREATED":
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      console.log("PayPal subscription activated");
      break;

    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      console.log("PayPal subscription canceled/suspended");
      break;

    case "PAYMENT.SALE.COMPLETED":
      console.log("PayPal payment completed");
      break;

    case "PAYMENT.SALE.DENIED":
      console.log("PayPal payment denied");
      break;
  }

  return { received: true };
}

/**
 * Downgrade expired subscriptions (run this as a cron job)
 */
async function processExpiredSubscriptions() {
  const connection = await pool.getConnection();

  try {
    // Find subscriptions that have ended and are marked for cancellation
    const [expired] = await connection.execute(
      `SELECT s.*, u.email 
             FROM subscriptions s
             JOIN users u ON s.user_id = u.id
             WHERE s.cancel_at_period_end = TRUE 
             AND s.current_period_end < NOW()
             AND s.status = 'active'`,
    );

    for (const sub of expired) {
      // Downgrade to free plan
      await connection.execute("UPDATE users SET plan = ? WHERE id = ?", [
        "free",
        sub.user_id,
      ]);

      // Mark subscription as canceled
      await connection.execute(
        `UPDATE subscriptions SET status = 'canceled' WHERE id = ?`,
        [sub.id],
      );

      console.log(`Downgraded user ${sub.user_id} to free plan`);
    }

    return { processed: expired.length };
  } finally {
    connection.release();
  }
}

module.exports = {
  createSquareCheckout,
  createPayPalCheckout,
  activateSubscription,
  cancelSubscription,
  getSubscription,
  handleSquareWebhook,
  handlePayPalWebhook,
  processExpiredSubscriptions,
  PLAN_PRICES,
};
