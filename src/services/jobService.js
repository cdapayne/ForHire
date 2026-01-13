const axios = require('axios');
const path = require('path');
const { scrapeWeWorkRemotely, scrapeRemoteOK } = require('./scraperService');
const { pool, initDB } = require('../config/database');

const generateMockJobs = () => {
    return [{
        id: 'mock-1',
        title: 'Cybersecurity Analyst (Mock)',
        company: 'SecureCorp',
        location: 'Remote',
        type: 'Full-time',
        salary: 'Competitive',
        posted_date: new Date().toLocaleDateString(),
        description: 'This is a placeholder because live data fetching failed.',
        url: '#',
        source: 'Mock'
    }];
};

const addJobsToSystem = async (newJobs) => {
    if (!newJobs || newJobs.length === 0) return 0;

    let addedCount = 0;
    const connection = await pool.getConnection();

    try {
        const now = new Date();
        const expiresAt = new Date(now.setMonth(now.getMonth() + 1));
        const addedAt = new Date();

        for (const job of newJobs) {
            const [rows] = await connection.execute('SELECT id FROM jobs WHERE id = ?', [job.id]);
            
            if (rows.length === 0) {
                const query = `
                    INSERT INTO jobs 
                    (id, title, company, location, type, salary, posted_date, description, url, source, added_at, expires_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                await connection.execute(query, [
                    job.id,
                    job.title || 'Unknown Title',
                    job.company || 'Unknown Company',
                    job.location || 'Remote',
                    job.type || 'Full-time',
                    job.salary || 'Not listed',
                    job.posted || new Date().toLocaleDateString(),
                    job.description || '',
                    job.url || '',
                    job.source || 'External',
                    addedAt,
                    expiresAt
                ]);
                addedCount++;
            }
        }
        console.log(`✅ Added ${addedCount} new unique jobs to the database.`);
    } catch (err) {
        console.error('Error adding jobs to DB:', err);
    } finally {
        connection.release();
    }
    return addedCount;
};

const refreshJobCache = async () => {
    console.log('🔄 Starting background job scrape...');
    const searchTerm = 'Cybersecurity';
    let newJobs = [];

    try {
        const appId = process.env.ADZUNA_APP_ID;
        const appKey = process.env.ADZUNA_APP_KEY;
        const countryCode = 'us'; 

        if (appId && appKey && appId !== 'your_app_id_here') {
             const url = `${process.env.BASE_URL || 'https://api.adzuna.com/v1/api'}/jobs/${countryCode}/search/1`;
             const response = await axios.get(url, {
                params: {
                    app_id: appId,
                    app_key: appKey,
                    what: searchTerm,
                    results_per_page: 20,
                    'content-type': 'application/json',
                    sort_by: 'date'
                }
            });

            if (response.data && response.data.results) {
                 const apiJobs = response.data.results.map(job => ({
                    id: String(job.id),
                    title: job.title.replace(/<[^>]*>?/gm, ''),
                    company: job.company.display_name,
                    location: job.location.display_name,
                    type: job.contract_time || 'Full-time',
                    salary: job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : 'Not listed',
                    posted: new Date(job.created).toLocaleDateString(),
                    description: job.description.replace(/<[^>]*>?/gm, '').substring(0, 200) + '...',
                    url: job.redirect_url,
                    source: 'Adzuna'
                }));
                newJobs = newJobs.concat(apiJobs);
            }
        }
    } catch (error) {
        console.error('⚠️ Adzuna API Error:', error.message);
    }

    try {
        console.log('...Scraping WeWorkRemotely');
        const scrapedJobs = await scrapeWeWorkRemotely(searchTerm);
        newJobs = newJobs.concat(scrapedJobs);
    } catch (scrapeError) {
        console.error('⚠️ WeWorkRemotely Scraping Error:', scrapeError.message);
    }

    try {
        console.log('...Scraping RemoteOK');
        const remoteOkJobs = await scrapeRemoteOK(searchTerm);
        newJobs = newJobs.concat(remoteOkJobs);
    } catch (rokError) {
        console.error('⚠️ RemoteOK Scraping Error:', rokError.message);
    }
    
    if (newJobs.length > 0) {
        await addJobsToSystem(newJobs);
    } else {
        console.log('⚠️ No new jobs found during background scrape.');
    }
};

const initJobScheduler = async () => {
    await initDB();
    console.log('🚀 System started. Job Scheduler active.');
    refreshJobCache();
    setInterval(refreshJobCache, 3600000);
};

const getJobs = async (filters) => {
    try {
        let query = 'SELECT * FROM jobs WHERE expires_at > NOW()';
        const params = [];

        if (filters && filters.search && filters.search.trim() !== '') {
            query += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
            const term = `%${filters.search}%`;
            params.push(term, term, term);
        }

        if (filters && filters.location && filters.location.trim() !== '') {
            query += ' AND location LIKE ?';
            params.push(`%${filters.location}%`);
        }

        query += ' ORDER BY added_at DESC';

        const [rows] = await pool.execute(query, params);
        
        if (rows.length === 0) {
             return [];
        }

        return rows.map(row => ({
            ...row,
            posted: row.posted_date
        }));

    } catch (err) {
        console.error('Error fetching jobs:', err);
        return [];
    }
};

module.exports = {
    getJobs,
    initJobScheduler,
    addJobsToSystem
};
