/**
 * Rate Limiter Middleware
 *
 * Configures rate limiting based on user's plan tier
 */

const rateLimit = require("express-rate-limit");
const { getPlan } = require("../config/plans");

/**
 * Create a rate limiter that checks the user's plan
 */
function createPlanBasedRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window

    // Dynamic limit based on plan
    max: (req) => {
      if (req.apiKey && req.apiKey.planDetails) {
        return req.apiKey.planDetails.rateLimit;
      }
      // Default to free tier limit for unauthenticated requests
      return 10;
    },

    // Use API key as identifier - no IP reference to avoid IPv6 issues
    keyGenerator: (req) => {
      if (req.apiKey) {
        return `apikey:${req.apiKey.id}`;
      }
      // For unauthenticated requests, use a fixed key (they'll share a limit)
      return "anon:global";
    },

    // Custom response
    handler: (req, res) => {
      const plan = req.apiKey?.planDetails || getPlan("free");
      res.status(429).json({
        success: false,
        error: "Rate limit exceeded",
        message: `You have exceeded the ${plan.rateLimit} requests per minute limit`,
        retryAfter:
          Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000) || 60,
        limit: plan.rateLimit,
        upgrade:
          req.apiKey?.plan !== "enterprise"
            ? "Upgrade your plan for higher rate limits"
            : null,
      });
    },

    // Include rate limit info in headers
    standardHeaders: true,
    legacyHeaders: false,

    // Skip rate limiting for certain paths
    skip: (req) => {
      // Skip for sample endpoint (has its own limits)
      if (req.path === "/api/v1/jobs/sample") {
        return true;
      }
      return false;
    },

    // Disable the IPv6 validation check
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
  });
}

/**
 * Basic rate limiter for public/unauthenticated endpoints
 */
const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for public endpoints
  message: {
    success: false,
    error: "Too many requests",
    message: "Please slow down and try again in a minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
});

/**
 * Strict rate limiter for auth endpoints (prevent brute force)
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    success: false,
    error: "Too many login attempts",
    message: "Please try again in 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
});

/**
 * Rate limiter for API key creation
 */
const apiKeyCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 keys per hour
  message: {
    success: false,
    error: "Too many API keys created",
    message: "Please wait before creating more API keys",
  },
  keyGenerator: (req) => `user:${req.userId || "anon"}`,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
});

module.exports = {
  createPlanBasedRateLimiter,
  publicRateLimiter,
  authRateLimiter,
  apiKeyCreationLimiter,
};
