/**
 * JobbyJobJob API Pricing Plans Configuration
 *
 * Defines tier limits for:
 * - Monthly job row quotas
 * - Location filtering limits
 * - Rate limits (requests per minute)
 */

const plans = {
  free: {
    name: "Free",
    price: 0,
    priceDisplay: "$0",
    billingPeriod: "forever",
    rowLimit: 100, // 100 job rows per month
    locationLimit: 1, // Single location filter
    rateLimit: 10, // 10 requests per minute
    resultsPerRequest: 25, // Max results per API call
    features: [
      "100 job rows per month",
      "1 location filter",
      "10 requests per minute",
      "Basic job data fields",
      "Community support",
    ],
    highlighted: false,
  },
  starter: {
    name: "Starter",
    price: 25,
    priceDisplay: "$25",
    billingPeriod: "month",
    rowLimit: 100000, // 100k job rows per month
    locationLimit: 50, // Up to 50 locations
    rateLimit: 60, // 60 requests per minute
    resultsPerRequest: 100, // Max results per API call
    features: [
      "100,000 job rows per month",
      "Up to 50 location filters",
      "60 requests per minute",
      "Full job data fields",
      "Advanced filters",
      "Email support",
    ],
    highlighted: false,
  },
  pro: {
    name: "Pro",
    price: 99,
    priceDisplay: "$99",
    billingPeriod: "month",
    rowLimit: 500000, // 500k job rows per month
    locationLimit: null, // Unlimited locations
    rateLimit: 200, // 200 requests per minute
    resultsPerRequest: 250, // Max results per API call
    features: [
      "500,000 job rows per month",
      "Unlimited location filters",
      "200 requests per minute",
      "All job data fields",
      "Webhooks & real-time updates",
      "Priority support",
    ],
    highlighted: true, // Most popular
  },
  enterprise: {
    name: "Enterprise",
    price: 199,
    priceDisplay: "$199",
    billingPeriod: "month",
    rowLimit: 1000000, // 1M job rows per month
    locationLimit: null, // Unlimited locations
    rateLimit: 1000, // 1000 requests per minute
    resultsPerRequest: 500, // Max results per API call
    features: [
      "1,000,000 job rows per month",
      "Unlimited location filters",
      "1,000 requests per minute",
      "All job data fields + metadata",
      "Bulk export & custom integrations",
      "Dedicated account manager",
      "99.9% uptime SLA",
    ],
    highlighted: false,
  },
};

/**
 * Get plan by name
 * @param {string} planName - Plan identifier (free, starter, pro, enterprise)
 * @returns {object} Plan configuration
 */
function getPlan(planName) {
  return plans[planName.toLowerCase()] || plans.free;
}

/**
 * Check if location count is within plan limits
 * @param {string} planName - Plan identifier
 * @param {number} locationCount - Number of locations requested
 * @returns {boolean} Whether the location count is allowed
 */
function isLocationCountAllowed(planName, locationCount) {
  const plan = getPlan(planName);
  if (plan.locationLimit === null) return true; // Unlimited
  return locationCount <= plan.locationLimit;
}

/**
 * Check if user has remaining row quota
 * @param {string} planName - Plan identifier
 * @param {number} usedRows - Rows already consumed this month
 * @param {number} requestedRows - Rows requested in current call
 * @returns {object} { allowed: boolean, remaining: number }
 */
function checkRowQuota(planName, usedRows, requestedRows) {
  const plan = getPlan(planName);
  const remaining = plan.rowLimit - usedRows;
  return {
    allowed: requestedRows <= remaining,
    remaining: Math.max(0, remaining),
    limit: plan.rowLimit,
  };
}

/**
 * Get all plans as array for display
 * @returns {array} Array of plan objects with keys
 */
function getAllPlans() {
  return Object.entries(plans).map(([key, plan]) => ({
    key,
    ...plan,
  }));
}

module.exports = {
  plans,
  getPlan,
  isLocationCountAllowed,
  checkRowQuota,
  getAllPlans,
};
