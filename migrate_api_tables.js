/**
 * Database Migration: API Users, Keys, and Usage Tables
 *
 * Run this script to create the necessary tables for the JobbyJobJob API:
 * - users: User accounts with plan information
 * - api_keys: API key storage with hashed keys
 * - api_usage: Usage tracking per API key
 * - subscriptions: Payment/subscription tracking
 *
 * Usage: node migrate_api_tables.js
 */

require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  console.log("🔄 Starting API tables migration...\n");

  try {
    // 1. Users Table
    console.log("📦 Creating users table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                plan ENUM('free', 'starter', 'pro', 'enterprise') DEFAULT 'free',
                is_active BOOLEAN DEFAULT TRUE,
                email_verified BOOLEAN DEFAULT FALSE,
                stripe_customer_id VARCHAR(255),
                paypal_customer_id VARCHAR(255),
                square_customer_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_plan (plan)
            )
        `);
    console.log("   ✅ users table created\n");

    // 2. API Keys Table
    console.log("📦 Creating api_keys table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                key_hash VARCHAR(255) NOT NULL,
                key_prefix VARCHAR(20) NOT NULL,
                name VARCHAR(100) DEFAULT 'Default Key',
                is_active BOOLEAN DEFAULT TRUE,
                last_used_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_key_hash (key_hash),
                INDEX idx_user_id (user_id),
                INDEX idx_key_prefix (key_prefix)
            )
        `);
    console.log("   ✅ api_keys table created\n");

    // 3. API Usage Table (for tracking monthly usage)
    console.log("📦 Creating api_usage table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS api_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                api_key_id INT NOT NULL,
                user_id INT NOT NULL,
                endpoint VARCHAR(100),
                method VARCHAR(10),
                status_code INT,
                rows_returned INT DEFAULT 0,
                response_time_ms INT,
                ip_address VARCHAR(45),
                user_agent VARCHAR(500),
                called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_api_key_id (api_key_id),
                INDEX idx_user_id (user_id),
                INDEX idx_called_at (called_at)
            )
        `);
    console.log("   ✅ api_usage table created\n");

    // 4. Monthly Usage Summary (for faster quota checks)
    console.log("📦 Creating monthly_usage table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS monthly_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                usage_month VARCHAR(7) NOT NULL,
                total_rows INT DEFAULT 0,
                total_requests INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_month (user_id, usage_month),
                INDEX idx_user_id (user_id),
                INDEX idx_usage_month (usage_month)
            )
        `);
    console.log("   ✅ monthly_usage table created\n");

    // 5. Subscriptions Table
    console.log("📦 Creating subscriptions table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                provider ENUM('stripe', 'paypal', 'square') NOT NULL,
                provider_subscription_id VARCHAR(255),
                provider_customer_id VARCHAR(255),
                plan ENUM('free', 'starter', 'pro', 'enterprise') NOT NULL,
                status ENUM('active', 'canceled', 'past_due', 'trialing', 'paused') DEFAULT 'active',
                current_period_start TIMESTAMP NULL,
                current_period_end TIMESTAMP NULL,
                cancel_at_period_end BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_provider (provider),
                INDEX idx_status (status)
            )
        `);
    console.log("   ✅ subscriptions table created\n");

    // 6. Password Reset Tokens
    console.log("📦 Creating password_reset_tokens table...");
    await connection.execute(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_token_hash (token_hash),
                INDEX idx_expires_at (expires_at)
            )
        `);
    console.log("   ✅ password_reset_tokens table created\n");

    console.log("✅ All API tables created successfully!\n");
    console.log("📊 Tables created:");
    console.log("   - users");
    console.log("   - api_keys");
    console.log("   - api_usage");
    console.log("   - monthly_usage");
    console.log("   - subscriptions");
    console.log("   - password_reset_tokens");
  } catch (error) {
    console.error("❌ Migration error:", error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate()
  .then(() => {
    console.log("\n🎉 Migration completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
