/**
 * JobbyJobJob API v1 Routes
 *
 * Protected API endpoints requiring API key authentication
 */

const express = require("express");
const router = express.Router();
const jobService = require("../../services/jobService");
const { protectApiRoute } = require("../../middleware/apiKey");
const { createPlanBasedRateLimiter } = require("../../middleware/rateLimiter");

// Apply rate limiting to all v1 routes
const rateLimiter = createPlanBasedRateLimiter();

/**
 * GET /api/v1/jobs - Get job listings
 *
 * Query Parameters:
 * - limit: Number of results (max depends on plan)
 * - offset: Pagination offset
 * - location: Filter by location (comma-separated for multiple)
 * - search: Search in title, company, description
 * - company: Filter by company name
 * - type: Filter by job type (full-time, part-time, contract, etc.)
 * - remote: Filter for remote jobs only (true/false)
 * - salary_min: Minimum salary filter
 * - salary_max: Maximum salary filter
 * - posted_after: Jobs posted after this date (ISO format)
 * - sort: Sort field (posted_at, salary, company)
 * - order: Sort order (asc, desc)
 */
router.get("/jobs", rateLimiter, ...protectApiRoute, async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      limit,
      offset = 0,
      location,
      search,
      company,
      type,
      remote,
      salary_min,
      salary_max,
      posted_after,
      sort = "posted_at",
      order = "desc",
    } = req.query;

    // Build query options
    const options = {
      search,
      location: req.locations || location, // Use normalized locations from middleware
      company,
      type,
      remote: remote === "true",
      salaryMin: salary_min ? parseInt(salary_min) : undefined,
      salaryMax: salary_max ? parseInt(salary_max) : undefined,
      postedAfter: posted_after,
      sort,
      order,
      limit: parseInt(limit) || req.apiKey.planDetails.resultsPerRequest,
      offset: parseInt(offset) || 0,
    };

    // Fetch jobs
    const jobs = await jobService.getJobs(options);

    // Get total count for pagination
    const totalJobs = await jobService.getJobCount(options);

    // Calculate response time
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      meta: {
        total: totalJobs,
        returned: jobs.length,
        limit: options.limit,
        offset: options.offset,
        hasMore: options.offset + jobs.length < totalJobs,
        responseTimeMs: responseTime,
      },
      quota: {
        used: req.quota?.used || 0,
        limit: req.quota?.limit || 0,
        remaining: req.quota?.remaining || 0,
      },
      data: jobs.map(formatJobResponse),
    });
  } catch (error) {
    console.error("API v1 jobs error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch jobs",
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/jobs/:id - Get a single job by ID
 */
router.get("/jobs/:id", rateLimiter, ...protectApiRoute, async (req, res) => {
  try {
    const jobId = req.params.id;

    const job = await jobService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    res.json({
      success: true,
      data: formatJobResponse(job, true), // Include full description
    });
  } catch (error) {
    console.error("API v1 job by ID error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch job",
    });
  }
});

/**
 * GET /api/v1/jobs/search - Advanced search
 */
router.get("/search", rateLimiter, ...protectApiRoute, async (req, res) => {
  try {
    const { q, fields, exact } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: "Search query (q) is required",
      });
    }

    const options = {
      search: q,
      searchFields: fields
        ? fields.split(",")
        : ["title", "company", "description"],
      exactMatch: exact === "true",
      limit:
        parseInt(req.query.limit) || req.apiKey.planDetails.resultsPerRequest,
      offset: parseInt(req.query.offset) || 0,
    };

    const jobs = await jobService.searchJobs(options);

    res.json({
      success: true,
      meta: {
        query: q,
        returned: jobs.length,
      },
      data: jobs.map(formatJobResponse),
    });
  } catch (error) {
    console.error("API v1 search error:", error);
    res.status(500).json({
      success: false,
      error: "Search failed",
    });
  }
});

/**
 * GET /api/v1/stats - Get job statistics
 */
router.get("/stats", rateLimiter, ...protectApiRoute, async (req, res) => {
  try {
    const stats = await jobService.getJobStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("API v1 stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch stats",
    });
  }
});

/**
 * GET /api/v1/locations - Get available locations
 */
router.get("/locations", rateLimiter, ...protectApiRoute, async (req, res) => {
  try {
    const locations = await jobService.getUniqueLocations();

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    console.error("API v1 locations error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch locations",
    });
  }
});

/**
 * GET /api/v1/companies - Get available companies
 */
router.get("/companies", rateLimiter, ...protectApiRoute, async (req, res) => {
  try {
    const companies = await jobService.getUniqueCompanies();

    res.json({
      success: true,
      data: companies,
    });
  } catch (error) {
    console.error("API v1 companies error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch companies",
    });
  }
});

/**
 * Format job for API response
 */
function formatJobResponse(job, includeFullDescription = false) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary || null,
    type: job.type || "Full-time",
    source: job.source,
    url: job.url,
    easyApply: Boolean(job.easy_apply),
    description: includeFullDescription
      ? job.description
      : job.description
        ? job.description.substring(0, 300) + "..."
        : null,
    postedAt: job.added_at,
    expiresAt: job.expires_at,
  };
}

module.exports = router;
