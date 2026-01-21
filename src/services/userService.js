/**
 * User Service
 *
 * Handles user registration, authentication, and management
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");
const { getPlan } = require("../config/plans");

const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Create a new user
 */
async function createUser({
  email,
  password,
  firstName,
  lastName,
  plan = "free",
}) {
  const connection = await pool.getConnection();

  try {
    // Check if user already exists
    const [existing] = await connection.execute(
      "SELECT id FROM users WHERE email = ?",
      [email.toLowerCase()],
    );

    if (existing.length > 0) {
      throw new Error("Email already registered");
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const [result] = await connection.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, plan) 
             VALUES (?, ?, ?, ?, ?)`,
      [email.toLowerCase(), passwordHash, firstName, lastName, plan],
    );

    const userId = result.insertId;

    // Initialize monthly usage for current month
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    await connection.execute(
      `INSERT INTO monthly_usage (user_id, usage_month, total_rows, total_requests) 
             VALUES (?, ?, 0, 0)`,
      [userId, yearMonth],
    );

    return {
      id: userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      plan,
    };
  } finally {
    connection.release();
  }
}

/**
 * Authenticate user and return JWT token
 */
async function authenticateUser(email, password) {
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      `SELECT id, email, password_hash, first_name, last_name, plan, is_active 
             FROM users WHERE email = ?`,
      [email.toLowerCase()],
    );

    if (users.length === 0) {
      throw new Error("Invalid email or password");
    }

    const user = users[0];

    if (!user.is_active) {
      throw new Error("Account is deactivated");
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        plan: user.plan,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        name: `${user.first_name} ${user.last_name}`,
        plan: user.plan,
      },
    };
  } finally {
    connection.release();
  }
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      `SELECT id, email, first_name, last_name, plan, is_active, created_at 
             FROM users WHERE id = ?`,
      [userId],
    );

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      name: `${user.first_name} ${user.last_name}`,
      plan: user.plan,
      isActive: user.is_active,
      createdAt: user.created_at,
    };
  } finally {
    connection.release();
  }
}

/**
 * Get user's current month usage
 */
async function getUserUsage(userId) {
  const connection = await pool.getConnection();

  try {
    // Get user's plan
    const [users] = await connection.execute(
      "SELECT plan FROM users WHERE id = ?",
      [userId],
    );

    if (users.length === 0) {
      throw new Error("User not found");
    }

    const userPlan = getPlan(users[0].plan);
    const yearMonth = new Date().toISOString().slice(0, 7);

    // Get or create monthly usage record
    let [usage] = await connection.execute(
      "SELECT total_rows, total_requests FROM monthly_usage WHERE user_id = ? AND usage_month = ?",
      [userId, yearMonth],
    );

    if (usage.length === 0) {
      // Create record for new month
      await connection.execute(
        "INSERT INTO monthly_usage (user_id, usage_month, total_rows, total_requests) VALUES (?, ?, 0, 0)",
        [userId, yearMonth],
      );
      usage = [{ total_rows: 0, total_requests: 0 }];
    }

    return {
      rowsUsed: usage[0].total_rows,
      rowLimit: userPlan.rowLimit,
      requestsUsed: usage[0].total_requests,
      rateLimit: userPlan.rateLimit,
      locationLimit: userPlan.locationLimit,
      plan: users[0].plan,
      yearMonth,
    };
  } finally {
    connection.release();
  }
}

/**
 * Update user's plan
 */
async function updateUserPlan(userId, newPlan) {
  const connection = await pool.getConnection();

  try {
    await connection.execute("UPDATE users SET plan = ? WHERE id = ?", [
      newPlan,
      userId,
    ]);

    return true;
  } finally {
    connection.release();
  }
}

/**
 * Update user profile
 */
async function updateUserProfile(userId, { firstName, lastName }) {
  const connection = await pool.getConnection();

  try {
    await connection.execute(
      "UPDATE users SET first_name = ?, last_name = ? WHERE id = ?",
      [firstName, lastName, userId],
    );

    return await getUserById(userId);
  } finally {
    connection.release();
  }
}

/**
 * Change user password
 */
async function changePassword(userId, currentPassword, newPassword) {
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      "SELECT password_hash FROM users WHERE id = ?",
      [userId],
    );

    if (users.length === 0) {
      throw new Error("User not found");
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      users[0].password_hash,
    );

    if (!isValidPassword) {
      throw new Error("Current password is incorrect");
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await connection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [newPasswordHash, userId],
    );

    return true;
  } finally {
    connection.release();
  }
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
  getUserUsage,
  updateUserPlan,
  updateUserProfile,
  changePassword,
  verifyToken,
  JWT_SECRET,
};
