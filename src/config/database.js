const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize the database table
const initDB = async () => {
    try {
        const connection = await pool.getConnection();
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS jobs (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(255),
                company VARCHAR(255),
                location VARCHAR(255),
                type VARCHAR(100),
                salary VARCHAR(100),
                posted_date VARCHAR(100),
                description TEXT,
                url TEXT,
                source VARCHAR(100),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL
            )
        `;
        await connection.query(createTableQuery);
        console.log('✅ Database table "jobs" checked/created.');
        connection.release();
    } catch (err) {
        console.error('❌ Database Initialization Error:', err.message);
    }
};

module.exports = {
    pool,
    initDB
};