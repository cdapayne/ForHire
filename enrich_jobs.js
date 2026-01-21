#!/usr/bin/env node

/**
 * Job Enrichment CLI Script
 * 
 * Usage:
 *   node enrich_jobs.js           - Enrich all jobs needing descriptions
 *   node enrich_jobs.js --auto    - Run in auto mode (for cron jobs)
 */

require('dotenv').config();
const { enrichJobDescriptions } = require('./src/services/jobEnricherService');
const { initDB } = require('./src/config/database');

const run = async () => {
    const args = process.argv.slice(2);
    const autoMode = args.includes('--auto');
    
    if (!autoMode) {
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║      MD Technical Job Board - Job Enricher           ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
    }
    
    try {
        // Initialize database
        await initDB();
        
        // Run enrichment
        const results = await enrichJobDescriptions();
        
        if (!autoMode) {
            console.log('✅ Enrichment complete!\n');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
};

run();
