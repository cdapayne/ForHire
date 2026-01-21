const express = require('express');
const router = express.Router();
const jobService = require('../services/jobService');
const { enrichJobDescriptions, getJobsNeedingEnrichment } = require('../services/jobEnricherService');

router.get('/', async (req, res) => {
    try {
        const { search, location } = req.query;
        const jobs = await jobService.getJobs({ search, location });
        res.render('index', { 
            title: 'MD Technical Job Board - Cybersecurity & IT Jobs',
            jobs: jobs,
            search: search || '',
            location: location || ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Resources page
router.get('/resources', (req, res) => {
    res.render('resources');
});

// JSON endpoint for dynamic searching if you move to React/Vue later or AJAX
router.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await jobService.getJobs(req.query);
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// Endpoint to receive jobs from the Chrome Extension
router.post('/api/upload', async (req, res) => {
    try {
        const jobs = req.body; // Expecting an array of job objects
        if (!Array.isArray(jobs)) {
            return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
        }

        console.log(`📥 Received ${jobs.length} jobs from Chrome Extension`);
        
        // Log sample job to verify salary and easyApply fields
        if (jobs.length > 0) {
            console.log('Sample job data:', {
                id: jobs[0].id,
                title: jobs[0].title,
                salary: jobs[0].salary,
                easyApply: jobs[0].easyApply,
                source: jobs[0].source
            });
        }

        const addedCount = await jobService.addJobsToSystem(jobs);
        res.json({ message: 'Jobs received', added: addedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save uploaded jobs' });
    }
});

// Endpoint to trigger job enrichment manually
router.post('/api/enrich', async (req, res) => {
    try {
        console.log('📡 Enrichment triggered via API');
        
        // Run enrichment asynchronously
        enrichJobDescriptions()
            .then(results => {
                console.log('✅ Enrichment completed:', results);
            })
            .catch(error => {
                console.error('❌ Enrichment error:', error);
            });
        
        res.json({ 
            message: 'Job enrichment started in background',
            status: 'processing'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to start enrichment' });
    }
});

// Endpoint to check enrichment status
router.get('/api/enrich/status', async (req, res) => {
    try {
        const jobs = await getJobsNeedingEnrichment();
        res.json({
            jobsNeedingEnrichment: jobs.length,
            jobs: jobs.slice(0, 10) // Return first 10 for preview
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to check enrichment status' });
    }
});


module.exports = router;
