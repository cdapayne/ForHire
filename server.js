const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const jobRoutes = require('./src/routes/jobs');
const { initJobScheduler } = require('./src/services/jobService');

app.use('/', jobRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start background scraping
    initJobScheduler();
});
