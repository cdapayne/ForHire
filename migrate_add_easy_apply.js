#!/usr/bin/env node

/**
 * Database Migration Script
 * Adds easy_apply column to existing jobs table
 */

require('dotenv').config();
const { pool } = require('./src/config/database');

const migrate = async () => {
    console.log('\n🔄 Running database migration...\n');
    
    try {
        const connection = await pool.getConnection();
        
        // Check if column already exists
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'jobs' 
            AND COLUMN_NAME = 'easy_apply'
        `, [process.env.DB_NAME]);
        
        if (columns.length > 0) {
            console.log('✅ Column "easy_apply" already exists. No migration needed.\n');
        } else {
            // Add the easy_apply column
            await connection.execute(`
                ALTER TABLE jobs 
                ADD COLUMN easy_apply BOOLEAN DEFAULT FALSE
            `);
            console.log('✅ Successfully added "easy_apply" column to jobs table.\n');
        }
        
        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
};

migrate();
