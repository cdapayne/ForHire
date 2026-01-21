/**
 * Authentication Middleware
 *
 * Verifies JWT tokens for session-based authentication (dashboard, settings, etc.)
 */

const { verifyToken, getUserById } = require("../services/userService");

/**
 * Require authentication via JWT token in cookie or Authorization header
 */
async function requireAuth(req, res, next) {
  try {
    // Check for token in cookie first, then Authorization header
    let token = req.cookies?.authToken;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      // For API requests, return JSON error
      if (
        req.path.startsWith("/api/") ||
        req.xhr ||
        req.headers.accept?.includes("application/json")
      ) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }
      // For web requests, redirect to login
      return res.redirect(
        "/login?redirect=" + encodeURIComponent(req.originalUrl),
      );
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get fresh user data
    const user = await getUserById(decoded.userId);

    if (!user) {
      if (req.path.startsWith("/api/") || req.xhr) {
        return res.status(401).json({
          success: false,
          error: "User not found",
        });
      }
      return res.redirect("/login");
    }

    if (!user.isActive) {
      if (req.path.startsWith("/api/") || req.xhr) {
        return res.status(403).json({
          success: false,
          error: "Account deactivated",
        });
      }
      return res.redirect("/login?error=deactivated");
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);

    if (
      req.path.startsWith("/api/") ||
      req.xhr ||
      req.headers.accept?.includes("application/json")
    ) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
    }
    return res.redirect("/login?error=session_expired");
  }
}

/**
 * Optional authentication - doesn't require auth but attaches user if present
 */
async function optionalAuth(req, res, next) {
  try {
    let token = req.cookies?.authToken;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (token) {
      const decoded = verifyToken(token);
      const user = await getUserById(decoded.userId);
      if (user && user.isActive) {
        req.user = user;
        req.userId = user.id;
      }
    }
  } catch (error) {
    // Silently ignore auth errors for optional auth
  }

  next();
}

/**
 * Require specific plan level
 */
function requirePlan(minimumPlan) {
  const planLevels = { free: 0, starter: 1, pro: 2, enterprise: 3 };

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const userLevel = planLevels[req.user.plan] || 0;
    const requiredLevel = planLevels[minimumPlan] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: `This feature requires ${minimumPlan} plan or higher`,
        currentPlan: req.user.plan,
        requiredPlan: minimumPlan,
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requirePlan,
};
