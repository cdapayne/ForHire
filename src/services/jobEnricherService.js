const puppeteer = require('puppeteer');
const { pool } = require('../config/database');

/**
 * Job Enricher Service
 * Fetches detailed job descriptions from job posting URLs and updates the database
 */

const BATCH_SIZE = 5; // Process 5 jobs at a time to avoid overwhelming resources
const TIMEOUT = 30000; // 30 second timeout per page
const MAX_RETRIES = 2;

/**
 * Extract job description from LinkedIn
 */
const extractLinkedInDescription = async (page) => {
    try {
        await page.waitForSelector('.show-more-less-html__markup, .description__text, .jobs-description', { timeout: 10000 });
        
        const description = await page.evaluate(() => {
            const selectors = [
                '.show-more-less-html__markup',
                '.description__text',
                '.jobs-description__content',
                '.jobs-box__html-content',
                'article.jobs-description'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element.innerText.trim();
                }
            }
            return null;
        });
        
        return description || 'Description not available';
    } catch (error) {
        console.log('LinkedIn extraction error:', error.message);
        return null;
    }
};

/**
 * Extract job description from Indeed
 */
const extractIndeedDescription = async (page) => {
    try {
        await page.waitForSelector('#jobDescriptionText, .jobsearch-jobDescriptionText, .job-description', { timeout: 10000 });
        
        const description = await page.evaluate(() => {
            const selectors = [
                '#jobDescriptionText',
                '.jobsearch-jobDescriptionText',
                '.job-description',
                '[id*="jobdescription"]',
                '[class*="jobdescription"]'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element.innerText.trim();
                }
            }
            return null;
        });
        
        return description || 'Description not available';
    } catch (error) {
        console.log('Indeed extraction error:', error.message);
        return null;
    }
};

/**
 * Extract job description from We Work Remotely
 */
const extractWeWorkRemotelyDescription = async (page) => {
    try {
        await page.waitForSelector('.listing-container, .job-description', { timeout: 10000 });
        
        const description = await page.evaluate(() => {
            const selectors = [
                '.listing-container .listing-container-description',
                '.job-description',
                '.listing-job-description',
                'article .content'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element.innerText.trim();
                }
            }
            return null;
        });
        
        return description || 'Description not available';
    } catch (error) {
        console.log('We Work Remotely extraction error:', error.message);
        return null;
    }
};

/**
 * Generic description extraction for unknown sources
 */
const extractGenericDescription = async (page) => {
    try {
        const description = await page.evaluate(() => {
            // Try common job description patterns
            const selectors = [
                '[class*="description"]',
                '[id*="description"]',
                '[class*="job-detail"]',
                '[class*="content"]',
                'article',
                'main'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.innerText.length > 200) {
                    return element.innerText.trim();
                }
            }
            
            // Fallback: get body text
            return document.body.innerText.substring(0, 2000);
        });
        
        return description || 'Description not available';
    } catch (error) {
        console.log('Generic extraction error:', error.message);
        return null;
    }
};

/**
 * Fetch job description from URL based on source
 */
const fetchJobDescription = async (browser, job, retryCount = 0) => {
    let page;
    try {
        page = await browser.newPage();
        
        // Set user agent to avoid being blocked
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Navigate to job URL
        console.log(`  Fetching: ${job.url}`);
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        
        // Wait a bit for dynamic content to load
        await page.waitForTimeout(2000);
        
        let description = null;
        
        // Extract description based on source
        if (job.source === 'LinkedIn') {
            description = await extractLinkedInDescription(page);
        } else if (job.source === 'Indeed') {
            description = await extractIndeedDescription(page);
        } else if (job.source === 'We Work Remotely') {
            description = await extractWeWorkRemotelyDescription(page);
        } else {
            description = await extractGenericDescription(page);
        }
        
        await page.close();
        
        if (description && description.length > 50) {
            return description;
        }
        
        // Retry if description is too short or null
        if (retryCount < MAX_RETRIES) {
            console.log(`  Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            return await fetchJobDescription(browser, job, retryCount + 1);
        }
        
        return null;
    } catch (error) {
        console.error(`  Error fetching ${job.id}:`, error.message);
        if (page) await page.close().catch(() => {});
        
        // Retry on error
        if (retryCount < MAX_RETRIES) {
            console.log(`  Retrying after error... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            return await fetchJobDescription(browser, job, retryCount + 1);
        }
        
        return null;
    }
};

/**
 * Update job description in database
 */
const updateJobDescription = async (jobId, description) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute(
            'UPDATE jobs SET description = ? WHERE id = ?',
            [description, jobId]
        );
        connection.release();
        return true;
    } catch (error) {
        console.error(`Error updating job ${jobId}:`, error.message);
        return false;
    }
};

/**
 * Get jobs that need enrichment (have URLs but minimal descriptions)
 */
const getJobsNeedingEnrichment = async () => {
    try {
        const connection = await pool.getConnection();
        const query = `
            SELECT id, title, company, url, source, description
            FROM jobs
            WHERE url IS NOT NULL 
            AND url != '' 
            AND url != '#'
            AND (
                description IS NULL 
                OR description = '' 
                OR description = 'View posting for details'
                OR description LIKE 'Job scraped from%'
                OR LENGTH(description) < 100
            )
            ORDER BY added_at DESC
            LIMIT 100
        `;
        const [rows] = await connection.execute(query);
        connection.release();
        return rows;
    } catch (error) {
        console.error('Error fetching jobs needing enrichment:', error.message);
        return [];
    }
};

/**
 * Main enrichment function
 */
const enrichJobDescriptions = async () => {
    console.log('\n🔍 Starting Job Enrichment Process...\n');
    
    const jobs = await getJobsNeedingEnrichment();
    
    if (jobs.length === 0) {
        console.log('✅ No jobs need enrichment. All jobs are up to date!\n');
        return { total: 0, enriched: 0, failed: 0 };
    }
    
    console.log(`📊 Found ${jobs.length} jobs needing enrichment\n`);
    
    let enrichedCount = 0;
    let failedCount = 0;
    
    // Launch browser once for all jobs
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });
    
    try {
        // Process jobs in batches
        for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
            const batch = jobs.slice(i, i + BATCH_SIZE);
            console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(jobs.length / BATCH_SIZE)}`);
            console.log(`   Jobs ${i + 1}-${Math.min(i + BATCH_SIZE, jobs.length)} of ${jobs.length}\n`);
            
            // Process batch in parallel
            const results = await Promise.allSettled(
                batch.map(job => fetchJobDescription(browser, job))
            );
            
            // Update database with results
            for (let j = 0; j < batch.length; j++) {
                const job = batch[j];
                const result = results[j];
                
                if (result.status === 'fulfilled' && result.value) {
                    const success = await updateJobDescription(job.id, result.value);
                    if (success) {
                        enrichedCount++;
                        console.log(`  ✅ Enriched: ${job.title} (${job.company})`);
                    } else {
                        failedCount++;
                        console.log(`  ❌ Failed to update: ${job.title}`);
                    }
                } else {
                    failedCount++;
                    console.log(`  ❌ Failed to fetch: ${job.title}`);
                }
            }
            
            // Wait between batches to be respectful to servers
            if (i + BATCH_SIZE < jobs.length) {
                console.log('\n⏳ Waiting 5 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } finally {
        await browser.close();
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 Enrichment Summary:');
    console.log(`   Total jobs processed: ${jobs.length}`);
    console.log(`   ✅ Successfully enriched: ${enrichedCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log('='.repeat(60) + '\n');
    
    return {
        total: jobs.length,
        enriched: enrichedCount,
        failed: failedCount
    };
};

module.exports = {
    enrichJobDescriptions,
    getJobsNeedingEnrichment
};
