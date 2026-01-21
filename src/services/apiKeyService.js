/**
 * API Key Service
 *
 * Handles API key generation, validation, and management
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../config/database");
const { getPlan } = require("../config/plans");

/**
 * Generate a new API key
 * Format: jjj_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */
function generateApiKey() {
  const prefix = "jjj_live_";
  const randomPart = crypto.randomBytes(24).toString("hex");
  return prefix + randomPart;
}

/**
 * Hash an API key for secure storage
 */
function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Create a new API key for a user
 */
async function createApiKey(userId, name = "Default Key") {
  const connection = await pool.getConnection();

  try {
    // Check how many active keys user has (limit to 5)
    const [existingKeys] = await connection.execute(
      "SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND is_active = TRUE",
      [userId],
    );

    if (existingKeys[0].count >= 5) {
      throw new Error("Maximum of 5 active API keys allowed");
    }

    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12); // jjj_live_xxx

    const [result] = await connection.execute(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name) 
             VALUES (?, ?, ?, ?)`,
      [userId, keyHash, keyPrefix, name],
    );

    return {
      id: result.insertId,
      key: apiKey, // Only returned once, never stored in plain text
      keyPrefix,
      name,
    };
  } finally {
    connection.release();
  }
}

/**
 * Validate an API key and return user info
 */
async function validateApiKey(apiKey) {
  const connection = await pool.getConnection();

  try {
    const keyHash = hashApiKey(apiKey);

    const [keys] = await connection.execute(
      `SELECT ak.id, ak.user_id, ak.name, ak.is_active,
                    u.email, u.plan, u.is_active as user_active
             FROM api_keys ak
             JOIN users u ON ak.user_id = u.id
             WHERE ak.key_hash = ?`,
      [keyHash],
    );

    if (keys.length === 0) {
      return { valid: false, error: "Invalid API key" };
    }

    const key = keys[0];

    if (!key.is_active) {
      return { valid: false, error: "API key has been revoked" };
    }

    if (!key.user_active) {
      return { valid: false, error: "User account is deactivated" };
    }

    // Update last used timestamp
    await connection.execute(
      "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
      [key.id],
    );

    const plan = getPlan(key.plan);

    return {
      valid: true,
      keyId: key.id,
      userId: key.user_id,
      email: key.email,
      plan: key.plan,
      planDetails: plan,
    };
  } finally {
    connection.release();
  }
}

/**
 * Get all API keys for a user
 */
async function getUserApiKeys(userId) {
  const connection = await pool.getConnection();

  try {
    const [keys] = await connection.execute(
      `SELECT id, key_prefix, name, is_active, last_used_at, created_at
             FROM api_keys 
             WHERE user_id = ? 
             ORDER BY created_at DESC`,
      [userId],
    );

    return keys.map((key) => ({
      id: key.id,
      keyPrefix: key.key_prefix,
      name: key.name,
      isActive: key.is_active,
      lastUsedAt: key.last_used_at,
      createdAt: key.created_at,
    }));
  } finally {
    connection.release();
  }
}

/**
 * Revoke (deactivate) an API key
 */
async function revokeApiKey(keyId, userId) {
  const connection = await pool.getConnection();

  try {
    const [result] = await connection.execute(
      "UPDATE api_keys SET is_active = FALSE WHERE id = ? AND user_id = ?",
      [keyId, userId],
    );

    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
}

/**
 * Delete an API key permanently
 */
async function deleteApiKey(keyId, userId) {
  const connection = await pool.getConnection();

  try {
    const [result] = await connection.execute(
      "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
      [keyId, userId],
    );

    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
}

/**
 * Record API usage
 */
async function recordUsage(
  keyId,
  userId,
  {
    endpoint,
    method,
    statusCode,
    rowsReturned,
    responseTimeMs,
    ipAddress,
    userAgent,
  },
) {
  const connection = await pool.getConnection();

  try {
    // Record individual request
    await connection.execute(
      `INSERT INTO api_usage (api_key_id, user_id, endpoint, method, status_code, rows_returned, response_time_ms, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        keyId,
        userId,
        endpoint,
        method,
        statusCode,
        rowsReturned || 0,
        responseTimeMs,
        ipAddress,
        userAgent?.substring(0, 500),
      ],
    );

    // Update monthly usage
    const yearMonth = new Date().toISOString().slice(0, 7);
    await connection.execute(
      `INSERT INTO monthly_usage (user_id, usage_month, total_rows, total_requests) 
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE 
             total_rows = total_rows + ?,
             total_requests = total_requests + 1`,
      [userId, yearMonth, rowsReturned || 0, rowsReturned || 0],
    );

    return true;
  } finally {
    connection.release();
  }
}

/**
 * Check if user has remaining quota
 */
async function checkQuota(userId, requestedRows = 0) {
  const connection = await pool.getConnection();

  try {
    // Get user's plan
    const [users] = await connection.execute(
      "SELECT plan FROM users WHERE id = ?",
      [userId],
    );

    if (users.length === 0) {
      return { allowed: false, error: "User not found" };
    }

    const plan = getPlan(users[0].plan);
    const yearMonth = new Date().toISOString().slice(0, 7);

    // Get current usage
    const [usage] = await connection.execute(
      "SELECT total_rows FROM monthly_usage WHERE user_id = ? AND usage_month = ?",
      [userId, yearMonth],
    );

    const currentUsage = usage.length > 0 ? usage[0].total_rows : 0;
    const remaining = plan.rowLimit - currentUsage;

    if (requestedRows > remaining) {
      return {
        allowed: false,
        error: "Monthly quota exceeded",
        remaining,
        limit: plan.rowLimit,
        used: currentUsage,
      };
    }

    return {
      allowed: true,
      remaining,
      limit: plan.rowLimit,
      used: currentUsage,
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  generateApiKey,
  createApiKey,
  validateApiKey,
  getUserApiKeys,
  revokeApiKey,
  deleteApiKey,
  recordUsage,
  checkQuota,
};
