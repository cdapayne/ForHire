/**
 * Database Migration: Add User Locations Table
 * 
 * Run this script to add the user_locations table for storing
 * which cities users want to filter by in their API calls.
 * 
 * Usage: node migrate_add_locations.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    console.log('🔄 Adding user_locations table...\n');

    try {
        // User Locations Table
        console.log('📦 Creating user_locations table...');
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_locations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                city_name VARCHAR(100) NOT NULL,
                geo_id VARCHAR(50) NOT NULL,
                state_code VARCHAR(2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_geo_id (geo_id),
                UNIQUE KEY unique_user_location (user_id, geo_id)
            )
        `);
        console.log('   ✅ user_locations table created\n');

        console.log('✅ Migration completed successfully!\n');
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

migrate()
    .then(() => {
        console.log('\n🎉 Migration completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
