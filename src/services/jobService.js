const axios = require("axios");
const path = require("path");
const { scrapeWeWorkRemotely, scrapeRemoteOK } = require("./scraperService");
const { pool, initDB } = require("../config/database");

const generateMockJobs = () => {
  return [
    {
      id: "mock-1",
      title: "Cybersecurity Analyst (Mock)",
      company: "SecureCorp",
      location: "Remote",
      type: "Full-time",
      salary: "Competitive",
      posted_date: new Date().toLocaleDateString(),
      description: "This is a placeholder because live data fetching failed.",
      url: "#",
      source: "Mock",
    },
  ];
};

const addJobsToSystem = async (newJobs) => {
  if (!newJobs || newJobs.length === 0) return 0;

  let addedCount = 0;
  let connection;

  try {
    connection = await pool.getConnection();
    const now = new Date();
    const expiresAt = new Date(now.setMonth(now.getMonth() + 1));
    const addedAt = new Date();

    for (const job of newJobs) {
      const [rows] = await connection.execute(
        "SELECT id FROM jobs WHERE id = ?",
        [job.id],
      );

      if (rows.length === 0) {
        const query = `
                    INSERT INTO jobs 
                    (id, title, company, location, type, salary, posted_date, description, url, source, easy_apply, added_at, expires_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

        await connection.execute(query, [
          job.id,
          job.title || "Unknown Title",
          job.company || "Unknown Company",
          job.location || "Remote",
          job.type || "Full-time",
          job.salary || "Not listed",
          job.posted || new Date().toLocaleDateString(),
          job.description || "",
          job.url || "",
          job.source || "External",
          job.easyApply || false,
          addedAt,
          expiresAt,
        ]);
        addedCount++;
      }
    }
    console.log(`✅ Added ${addedCount} new unique jobs to the database.`);
  } catch (err) {
    console.error("Error adding jobs to DB:", err);
    console.error("Database connection details:", {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
    });
    throw err;
  } finally {
    if (connection) connection.release();
  }
  return addedCount;
};

const refreshJobCache = async () => {
  console.log("🔄 Starting background job scrape...");
  const searchTerm = "Cybersecurity";
  let newJobs = [];

  try {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    const countryCode = "us";

    if (appId && appKey && appId !== "your_app_id_here") {
      const url = `${process.env.BASE_URL || "https://api.adzuna.com/v1/api"}/jobs/${countryCode}/search/1`;
      const response = await axios.get(url, {
        params: {
          app_id: appId,
          app_key: appKey,
          what: searchTerm,
          results_per_page: 20,
          "content-type": "application/json",
          sort_by: "date",
        },
      });

      if (response.data && response.data.results) {
        const apiJobs = response.data.results.map((job) => ({
          id: String(job.id),
          title: job.title.replace(/<[^>]*>?/gm, ""),
          company: job.company.display_name,
          location: job.location.display_name,
          type: job.contract_time || "Full-time",
          salary: job.salary_min
            ? `$${job.salary_min} - $${job.salary_max}`
            : "Not listed",
          posted: new Date(job.created).toLocaleDateString(),
          description:
            job.description.replace(/<[^>]*>?/gm, "").substring(0, 200) + "...",
          url: job.redirect_url,
          source: "Adzuna",
        }));
        newJobs = newJobs.concat(apiJobs);
      }
    }
  } catch (error) {
    console.error("⚠️ Adzuna API Error:", error.message);
  }

  try {
    console.log("...Scraping WeWorkRemotely");
    const scrapedJobs = await scrapeWeWorkRemotely(searchTerm);
    newJobs = newJobs.concat(scrapedJobs);
  } catch (scrapeError) {
    console.error("⚠️ WeWorkRemotely Scraping Error:", scrapeError.message);
  }

  try {
    console.log("...Scraping RemoteOK");
    const remoteOkJobs = await scrapeRemoteOK(searchTerm);
    newJobs = newJobs.concat(remoteOkJobs);
  } catch (rokError) {
    console.error("⚠️ RemoteOK Scraping Error:", rokError.message);
  }

  if (newJobs.length > 0) {
    await addJobsToSystem(newJobs);
  } else {
    console.log("⚠️ No new jobs found during background scrape.");
  }
};

const initJobScheduler = async () => {
  await initDB();
  console.log("🚀 System started. Job Scheduler active.");
  refreshJobCache();
  setInterval(refreshJobCache, 3600000);
};

const getJobs = async (filters) => {
  try {
    let query = "SELECT * FROM jobs WHERE expires_at > NOW()";
    const params = [];

    if (filters && filters.search && filters.search.trim() !== "") {
      query += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)";
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    if (filters && filters.location && filters.location.trim() !== "") {
      // Handle multiple locations (array or comma-separated)
      let locations = filters.location;
      if (typeof locations === "string") {
        locations = locations
          .split(",")
          .map((l) => l.trim())
          .filter((l) => l);
      }
      if (Array.isArray(locations) && locations.length > 0) {
        const locationConditions = locations
          .map(() => "location LIKE ?")
          .join(" OR ");
        query += ` AND (${locationConditions})`;
        locations.forEach((loc) => params.push(`%${loc}%`));
      }
    }

    if (filters && filters.company && filters.company.trim() !== "") {
      query += " AND company LIKE ?";
      params.push(`%${filters.company}%`);
    }

    if (filters && filters.remote === true) {
      query += " AND (location LIKE ? OR location LIKE ?)";
      params.push("%remote%", "%Remote%");
    }

    query += " ORDER BY added_at DESC";

    // Apply limit and offset
    if (filters && filters.limit) {
      query += " LIMIT ?";
      params.push(parseInt(filters.limit));
    }

    if (filters && filters.offset) {
      query += " OFFSET ?";
      params.push(parseInt(filters.offset));
    }

    const [rows] = await pool.execute(query, params);

    if (rows.length === 0) {
      return [];
    }

    return rows.map((row) => ({
      ...row,
      posted: row.posted_date,
    }));
  } catch (err) {
    console.error("Error fetching jobs:", err);
    return [];
  }
};

/**
 * Get total count of jobs matching filters
 */
const getJobCount = async (filters) => {
  try {
    let query = "SELECT COUNT(*) as total FROM jobs WHERE expires_at > NOW()";
    const params = [];

    if (filters && filters.search && filters.search.trim() !== "") {
      query += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)";
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    if (filters && filters.location && filters.location.trim() !== "") {
      let locations = filters.location;
      if (typeof locations === "string") {
        locations = locations
          .split(",")
          .map((l) => l.trim())
          .filter((l) => l);
      }
      if (Array.isArray(locations) && locations.length > 0) {
        const locationConditions = locations
          .map(() => "location LIKE ?")
          .join(" OR ");
        query += ` AND (${locationConditions})`;
        locations.forEach((loc) => params.push(`%${loc}%`));
      }
    }

    const [rows] = await pool.execute(query, params);
    return rows[0]?.total || 0;
  } catch (err) {
    console.error("Error counting jobs:", err);
    return 0;
  }
};

/**
 * Get a single job by ID
 */
const getJobById = async (jobId) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM jobs WHERE id = ?", [
      jobId,
    ]);
    return rows[0] || null;
  } catch (err) {
    console.error("Error fetching job by ID:", err);
    return null;
  }
};

/**
 * Get unique locations from jobs
 */
const getUniqueLocations = async () => {
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT location FROM jobs WHERE expires_at > NOW() ORDER BY location",
    );
    return rows.map((r) => r.location);
  } catch (err) {
    console.error("Error fetching locations:", err);
    return [];
  }
};

/**
 * Get unique companies from jobs
 */
const getUniqueCompanies = async () => {
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT company FROM jobs WHERE expires_at > NOW() ORDER BY company",
    );
    return rows.map((r) => r.company);
  } catch (err) {
    console.error("Error fetching companies:", err);
    return [];
  }
};

/**
 * Get job statistics
 */
const getJobStats = async () => {
  try {
    const [totalRows] = await pool.execute(
      "SELECT COUNT(*) as total FROM jobs WHERE expires_at > NOW()",
    );

    const [sourceRows] = await pool.execute(
      "SELECT source, COUNT(*) as count FROM jobs WHERE expires_at > NOW() GROUP BY source",
    );

    const [recentRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM jobs WHERE added_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)",
    );

    return {
      totalJobs: totalRows[0]?.total || 0,
      addedLast24h: recentRows[0]?.count || 0,
      bySource: sourceRows.reduce((acc, row) => {
        acc[row.source] = row.count;
        return acc;
      }, {}),
    };
  } catch (err) {
    console.error("Error fetching stats:", err);
    return { totalJobs: 0, addedLast24h: 0, bySource: {} };
  }
};

/**
 * Search jobs with advanced options
 */
const searchJobs = async (options) => {
  return getJobs({
    search: options.search,
    limit: options.limit,
    offset: options.offset,
  });
};

module.exports = {
  getJobs,
  getJobCount,
  getJobById,
  getUniqueLocations,
  getUniqueCompanies,
  getJobStats,
  searchJobs,
  initJobScheduler,
  addJobsToSystem,
};
