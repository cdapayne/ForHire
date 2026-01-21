/**
 * API Key Authentication Middleware
 *
 * Validates API keys from X-API-Key header for public API endpoints
 */

const {
  validateApiKey,
  recordUsage,
  checkQuota,
} = require("../services/apiKeyService");
const { getPlan, isLocationCountAllowed } = require("../config/plans");

/**
 * Require valid API key for access
 */
async function requireApiKey(req, res, next) {
  const startTime = Date.now();

  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key required",
        message: "Include your API key in the X-API-Key header",
      });
    }

    // Validate the API key
    const validation = await validateApiKey(apiKey);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        error: validation.error,
      });
    }

    // Attach API key info to request
    req.apiKey = {
      id: validation.keyId,
      userId: validation.userId,
      email: validation.email,
      plan: validation.plan,
      planDetails: validation.planDetails,
    };

    // Store start time for usage tracking
    req.apiStartTime = startTime;

    next();
  } catch (error) {
    console.error("API key middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication error",
    });
  }
}

/**
 * Check and enforce quota limits
 */
async function enforceQuota(req, res, next) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key required",
      });
    }

    // Estimate rows that will be returned (use limit param or default)
    const requestedLimit =
      parseInt(req.query.limit) || req.apiKey.planDetails.resultsPerRequest;

    // Check quota
    const quota = await checkQuota(req.apiKey.userId, requestedLimit);

    if (!quota.allowed) {
      return res.status(429).json({
        success: false,
        error: "Monthly quota exceeded",
        quota: {
          used: quota.used,
          limit: quota.limit,
          remaining: quota.remaining,
        },
        message: "Upgrade your plan for more API calls",
      });
    }

    // Attach quota info to request
    req.quota = quota;

    next();
  } catch (error) {
    console.error("Quota check error:", error);
    return res.status(500).json({
      success: false,
      error: "Quota check failed",
    });
  }
}

/**
 * Validate location filter count against plan limits
 */
function enforceLocationLimit(req, res, next) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key required",
      });
    }

    // Parse locations from query
    let locations = req.query.location || req.query.locations;

    if (!locations) {
      return next();
    }

    // Handle comma-separated or array
    if (typeof locations === "string") {
      locations = locations
        .split(",")
        .map((l) => l.trim())
        .filter((l) => l);
    }

    const locationCount = Array.isArray(locations) ? locations.length : 1;
    const plan = req.apiKey.planDetails;

    // Check if location count is within plan limits
    if (!isLocationCountAllowed(req.apiKey.plan, locationCount)) {
      return res.status(403).json({
        success: false,
        error: "Location limit exceeded",
        message: `Your ${req.apiKey.plan} plan allows ${plan.locationLimit} location(s) per request. You requested ${locationCount}.`,
        limit: plan.locationLimit,
        requested: locationCount,
        upgrade: "Upgrade to Pro or Enterprise for unlimited locations",
      });
    }

    // Normalize locations for downstream use
    req.locations = locations;

    next();
  } catch (error) {
    console.error("Location limit error:", error);
    return res.status(500).json({
      success: false,
      error: "Location validation failed",
    });
  }
}

/**
 * Enforce results per request limit based on plan
 */
function enforceResultsLimit(req, res, next) {
  try {
    if (!req.apiKey) {
      return next();
    }

    const plan = req.apiKey.planDetails;
    let requestedLimit = parseInt(req.query.limit);

    if (!requestedLimit || requestedLimit > plan.resultsPerRequest) {
      req.query.limit = plan.resultsPerRequest;
    }

    next();
  } catch (error) {
    console.error("Results limit error:", error);
    next();
  }
}

/**
 * Track API usage after response is sent
 */
function trackUsage(req, res, next) {
  // Store original json method
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    // Calculate response time
    const responseTime = Date.now() - (req.apiStartTime || Date.now());

    // Count rows returned (if applicable)
    let rowsReturned = 0;
    if (data && data.data && Array.isArray(data.data)) {
      rowsReturned = data.data.length;
    }

    // Record usage asynchronously (don't wait for it)
    if (req.apiKey) {
      recordUsage(req.apiKey.id, req.apiKey.userId, {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        rowsReturned,
        responseTimeMs: responseTime,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
      }).catch((err) => console.error("Usage tracking error:", err));
    }

    // Call original json method
    return originalJson(data);
  };

  next();
}

/**
 * Combined middleware for protected API endpoints
 */
const protectApiRoute = [
  requireApiKey,
  enforceQuota,
  enforceLocationLimit,
  enforceResultsLimit,
  trackUsage,
];

module.exports = {
  requireApiKey,
  enforceQuota,
  enforceLocationLimit,
  enforceResultsLimit,
  trackUsage,
  protectApiRoute,
};
