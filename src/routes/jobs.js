const express = require('express');
const router = express.Router();
const jobService = require('../services/jobService');

router.get('/', async (req, res) => {
    try {
        const { search, location } = req.query;
        const jobs = await jobService.getJobs({ search, location });
        res.render('index', { 
            title: 'LMSJobs - Cybersecurity & IT Job Board',
            jobs: jobs,
            search: search || '',
            location: location || ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
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

        const addedCount = await jobService.addJobsToSystem(jobs);
        res.json({ message: 'Jobs received', added: addedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save uploaded jobs' });
    }
});

module.exports = router;
