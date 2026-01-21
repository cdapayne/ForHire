const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "cdn.tailwindcss.com",
          "cdnjs.cloudflare.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "cdn.tailwindcss.com",
          "cdnjs.cloudflare.com",
          "fonts.googleapis.com",
        ],
        fontSrc: [
          "'self'",
          "cdnjs.cloudflare.com",
          "fonts.gstatic.com",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
const jobRoutes = require("./src/routes/jobs");
const authRoutes = require("./src/routes/auth");
const billingRoutes = require("./src/routes/billing");
const locationsRoutes = require("./src/routes/locations");
const apiV1Routes = require("./src/routes/v1/jobs");
const { initJobScheduler } = require("./src/services/jobService");

// Mount routes
app.use("/", jobRoutes); // Job board + API landing page
app.use("/", authRoutes); // Auth routes (/auth/*, /api/keys/*)
app.use("/", billingRoutes); // Billing routes (/billing/*)
app.use("/", locationsRoutes); // Location management routes
app.use("/api/v1", apiV1Routes); // Protected API v1 routes

// Error handling
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start background scraping
  initJobScheduler();
});
