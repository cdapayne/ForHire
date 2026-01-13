const fs = require('fs');
const content = `const axios = require('axios');
const fsPromises = require('fs').promises;
const path = require('path');
const { scrapeWeWorkRemotely, scrapeRemoteOK } = require('./scraperService');

// Path to JSON DB
const DB_PATH = path.join(__dirname, '../../data/jobs.json');

// In-memory storage for jobs
let jobCache = [];
let isFirstLoad = true;

const generateMockJobs = () => {
    return [{
        id: 'mock-1',
        title: 'Cybersecurity Analyst (Mock)',
        company: 'SecureCorp',
        location: 'Remote',
        type: 'Full-time',
        salary: 'Competitive',
        posted: new Date().toLocaleDateString(),
        description: 'This is a placeholder because live data fetching failed.',
        url: '#',
        source: 'Mock'
    }];
};

const saveJobsToDb = async (jobs) => {
    try {
        await fsPromises.writeFile(DB_PATH, JSON.stringify(jobs, null, 2));
        console.log('💾 Jobs saved to database.');
    } catch (err) {
        console.error('Error saving jobs to DB:', err);
    }
};

const loadJobsFromDb = async () => {
    try {
        const data = await fsPromises.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.log('⚠️ No existing database found or error reading it. Starting empty.');
        return [];
    }
};

const addJobsToSystem = async (newJobs) => {
    const existingIds = new Set(jobCache.map(j => j.id));
    const uniqueNewJobs = newJobs.filter(j => !existingIds.has(j.id));
    
    if (uniqueNewJobs.length > 0) {
        jobCache = [...uniqueNewJobs, ...jobCache]; 
        await saveJobsToDb(jobCache);
        console.log(\`✅ Added \${uniqueNewJobs.length} new unique jobs to the system.\`);
        return uniqueNewJobs.length;
    }
    return 0;
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
             const url = \`\${process.env.BASE_URL || 'https://api.adzuna.com/v1/api'}/jobs/\${countryCode}/search/1\`;
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
                    salary: job.salary_min ? \`$\${job.salary_min} - $\${job.salary_max}\` : 'Not listed',
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
        isFirstLoad = false;
    } else {
        console.log('⚠️ No new jobs found during background scrape.');
        if (isFirstLoad) {
             const fromDb = await loadJobsFromDb();
             if (fromDb.length > 0) {
                 jobCache = fromDb;
                 isFirstLoad = false;
                 console.log(\`loaded \${jobCache.length} jobs from local DB.\`);
             }
        }
    }
};

const initJobScheduler = async () => {
    jobCache = await loadJobsFromDb();
    console.log(\`🚀 System started. Loaded \${jobCache.length} jobs from database.\`);
    if(jobCache.length > 0) isFirstLoad = false;

    refreshJobCache();
    
    setInterval(refreshJobCache, 3600000);
};

const getJobs = async (filters) => {
    let results = jobCache;

    if (filters && filters.search && filters.search.trim() !== '') {
        const term = filters.search.toLowerCase();
        results = jobCache.filter(job => 
            (job.title && job.title.toLowerCase().includes(term)) || 
            (job.company && job.company.toLowerCase().includes(term)) ||
            (job.description && job.description.toLowerCase().includes(term))
        );
    }

    if (filters && filters.location && filters.location.trim() !== '') {
        const loc = filters.location.toLowerCase();
        results = results.filter(job => 
            job.location && job.location.toLowerCase().includes(loc)
        );
    }

    if (results.length === 0 && isFirstLoad) {
         return generateMockJobs();
    }

    return results;
};

module.exports = {
    getJobs,
    initJobScheduler,
    addJobsToSystem
};`;

fs.writeFileSync(path.join(__dirname, 'src/services/jobService.js'), content);
console.log('File written successfully');
