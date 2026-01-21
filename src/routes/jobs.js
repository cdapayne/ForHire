const express = require("express");
const router = express.Router();
const jobService = require("../services/jobService");
const {
  enrichJobDescriptions,
  getJobsNeedingEnrichment,
} = require("../services/jobEnricherService");

router.get("/", async (req, res) => {
  try {
    const { search, location } = req.query;
    const jobs = await jobService.getJobs({ search, location });
    res.render("index", {
      title: "MD Technical Job Board - Cybersecurity & IT Jobs",
      jobs: jobs,
      search: search || "",
      location: location || "",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// Resources page
router.get("/resources", (req, res) => {
  res.render("resources");
});

// JSON endpoint for dynamic searching if you move to React/Vue later or AJAX
router.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await jobService.getJobs(req.query);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// Endpoint to receive jobs from the Chrome Extension
router.post("/api/upload", async (req, res) => {
  try {
    const jobs = req.body; // Expecting an array of job objects
    if (!Array.isArray(jobs)) {
      return res
        .status(400)
        .json({ error: "Invalid data format. Expected an array." });
    }

    console.log(`📥 Received ${jobs.length} jobs from Chrome Extension`);

    // Log sample job to verify salary and easyApply fields
    if (jobs.length > 0) {
      console.log("Sample job data:", {
        id: jobs[0].id,
        title: jobs[0].title,
        salary: jobs[0].salary,
        easyApply: jobs[0].easyApply,
        source: jobs[0].source,
      });
    }

    const addedCount = await jobService.addJobsToSystem(jobs);
    res.json({ message: "Jobs received", added: addedCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save uploaded jobs" });
  }
});

// Endpoint to trigger job enrichment manually
router.post("/api/enrich", async (req, res) => {
  try {
    console.log("📡 Enrichment triggered via API");

    // Run enrichment asynchronously
    enrichJobDescriptions()
      .then((results) => {
        console.log("✅ Enrichment completed:", results);
      })
      .catch((error) => {
        console.error("❌ Enrichment error:", error);
      });

    res.json({
      message: "Job enrichment started in background",
      status: "processing",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to start enrichment" });
  }
});

// Endpoint to check enrichment status
router.get("/api/enrich/status", async (req, res) => {
  try {
    const jobs = await getJobsNeedingEnrichment();
    res.json({
      jobsNeedingEnrichment: jobs.length,
      jobs: jobs.slice(0, 10), // Return first 10 for preview
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to check enrichment status" });
  }
});

// ============================================
// JobbyJobJob API Routes
// ============================================

// API Landing Page
router.get("/api", (req, res) => {
  res.render("api");
});

// Auth Pages
router.get("/login", (req, res) => {
  res.render("auth/login");
});

router.get("/register", (req, res) => {
  res.render("auth/register");
});

// Dashboard - now protected by auth middleware in auth.js
// This is a fallback for unauthenticated users
router.get("/dashboard", async (req, res) => {
  // Check for auth token
  const token = req.cookies?.authToken;

  if (!token) {
    return res.redirect("/login?redirect=/dashboard");
  }

  try {
    const {
      verifyToken,
      getUserById,
      getUserUsage,
    } = require("../services/userService");
    const { getUserApiKeys } = require("../services/apiKeyService");

    const decoded = verifyToken(token);
    const user = await getUserById(decoded.userId);

    if (!user) {
      return res.redirect("/login");
    }

    const usage = await getUserUsage(user.id);
    const apiKeys = await getUserApiKeys(user.id);

    res.render("auth/dashboard", {
      user,
      usage,
      apiKeys,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.redirect("/login?error=session_expired");
  }
});

// Sample Jobs Endpoint for API Landing Page (no auth required)
// Returns up to 25 active job listings for the interactive preview
router.get("/api/v1/jobs/sample", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 25);
    const allJobs = await jobService.getJobs({});

    // Take only the requested number of jobs
    const sampleJobs = allJobs.slice(0, limit);

    // Format response like a real API would
    res.json({
      success: true,
      meta: {
        total: allJobs.length,
        returned: sampleJobs.length,
        limit: limit,
        note: "This is a sample endpoint. Sign up for full API access.",
      },
      data: sampleJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary || null,
        type: job.type || "Full-time",
        source: job.source,
        url: job.url,
        easyApply: job.easy_apply || false,
        postedAt: job.added_at,
        description: job.description
          ? job.description.substring(0, 200) + "..."
          : null,
      })),
    });
  } catch (error) {
    console.error("Sample jobs error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch sample jobs",
    });
  }
});

module.exports = router;
