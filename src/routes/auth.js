/**
 * Authentication Routes
 *
 * Handles user registration, login, logout, and session management
 */

const express = require("express");
const router = express.Router();
const {
  createUser,
  authenticateUser,
  getUserById,
  getUserUsage,
  changePassword,
} = require("../services/userService");
const {
  createApiKey,
  getUserApiKeys,
  revokeApiKey,
  deleteApiKey,
} = require("../services/apiKeyService");
const { requireAuth } = require("../middleware/auth");
const {
  authRateLimiter,
  apiKeyCreationLimiter,
} = require("../middleware/rateLimiter");

/**
 * POST /auth/register - Create a new user account
 */
router.post("/auth/register", authRateLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName, plan } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Create user
    const user = await createUser({
      email,
      password,
      firstName,
      lastName,
      plan: plan || "free",
    });

    // Create default API key
    const apiKey = await createApiKey(user.id, "Default Key");

    // Auto-login: generate token
    const auth = await authenticateUser(email, password);

    // Set cookie
    res.cookie("authToken", auth.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: auth.user,
      apiKey: {
        key: apiKey.key, // Only shown once!
        name: apiKey.name,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
});

/**
 * POST /auth/login - Authenticate user
 */
router.post("/auth/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const auth = await authenticateUser(email, password);

    // Set cookie
    const maxAge = remember
      ? 30 * 24 * 60 * 60 * 1000 // 30 days
      : 7 * 24 * 60 * 60 * 1000; // 7 days

    res.cookie("authToken", auth.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
    });

    res.json({
      success: true,
      message: "Login successful",
      user: auth.user,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({
      success: false,
      message: error.message || "Invalid email or password",
    });
  }
});

/**
 * POST /auth/logout - Clear session
 */
router.post("/auth/logout", (req, res) => {
  res.clearCookie("authToken");
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * GET /auth/logout - Clear session (for link-based logout)
 */
router.get("/logout", (req, res) => {
  res.clearCookie("authToken");
  res.redirect("/login?message=logged_out");
});

/**
 * GET /auth/me - Get current user info
 */
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const usage = await getUserUsage(req.userId);

    res.json({
      success: true,
      user: req.user,
      usage,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user info",
    });
  }
});

/**
 * POST /auth/change-password - Change user password
 */
router.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    await changePassword(req.userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to change password",
    });
  }
});

// ============================================
// API Key Management
// ============================================

/**
 * GET /api/keys - List user's API keys
 */
router.get("/api/keys", requireAuth, async (req, res) => {
  try {
    const keys = await getUserApiKeys(req.userId);

    res.json({
      success: true,
      keys,
    });
  } catch (error) {
    console.error("Get API keys error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get API keys",
    });
  }
});

/**
 * POST /api/keys - Create new API key
 */
router.post(
  "/api/keys",
  requireAuth,
  apiKeyCreationLimiter,
  async (req, res) => {
    try {
      const { name } = req.body;

      const apiKey = await createApiKey(req.userId, name || "API Key");

      res.status(201).json({
        success: true,
        message: "API key created",
        key: apiKey.key, // Only shown once!
        id: apiKey.id,
        name: apiKey.name,
      });
    } catch (error) {
      console.error("Create API key error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create API key",
      });
    }
  },
);

/**
 * DELETE /api/keys/:id - Revoke an API key
 */
router.delete("/api/keys/:id", requireAuth, async (req, res) => {
  try {
    const keyId = parseInt(req.params.id);

    const revoked = await revokeApiKey(keyId, req.userId);

    if (!revoked) {
      return res.status(404).json({
        success: false,
        message: "API key not found",
      });
    }

    res.json({
      success: true,
      message: "API key revoked",
    });
  } catch (error) {
    console.error("Revoke API key error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke API key",
    });
  }
});

module.exports = router;
