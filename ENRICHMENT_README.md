# Job Enrichment Feature

## Overview

The Job Enrichment service automatically fetches detailed job descriptions from job posting URLs and updates them in the database. This provides more comprehensive information for each job listing.

## How It Works

1. **Identifies Jobs**: Finds jobs with URLs but minimal or generic descriptions
2. **Visits Pages**: Uses Puppeteer to navigate to each job posting URL
3. **Extracts Content**: Intelligently scrapes job descriptions based on the source (LinkedIn, Indeed, We Work Remotely, etc.)
4. **Updates Database**: Saves the enriched descriptions back to the database

## Usage

### Method 1: Manual CLI Script

Run the enrichment script manually:

```bash
node enrich_jobs.js
```

### Method 2: Web UI Button

Click the "Enrich" button in the navigation bar to trigger enrichment in the background.

### Method 3: API Endpoint

Trigger via POST request:

```bash
curl -X POST http://localhost:3000/api/enrich
```

Check status:

```bash
curl http://localhost:3000/api/enrich/status
```

### Method 4: Automatic Enrichment

Add to your cron jobs for automatic enrichment:

```bash
# Run every day at 2 AM
0 2 * * * cd /path/to/ForHire && node enrich_jobs.js --auto
```

## Features

- ✅ **Source-Specific Extraction**: Custom scrapers for LinkedIn, Indeed, and We Work Remotely
- ✅ **Batch Processing**: Processes jobs in batches of 5 to manage resources
- ✅ **Retry Logic**: Automatically retries failed extractions up to 2 times
- ✅ **Rate Limiting**: Waits between batches to be respectful to target servers
- ✅ **Error Handling**: Continues processing even if individual jobs fail
- ✅ **Progress Tracking**: Detailed console output showing enrichment progress

## Configuration

Edit these constants in `src/services/jobEnricherService.js`:

```javascript
const BATCH_SIZE = 5;        // Jobs to process simultaneously
const TIMEOUT = 30000;       // Page load timeout (ms)
const MAX_RETRIES = 2;       // Retry attempts per job
```

## Requirements

The enrichment service requires:
- Puppeteer (already included in package.json)
- Active database connection
- Valid job URLs in the database

## Troubleshooting

### Jobs not being enriched

- Check that jobs have valid URLs (not "#" or empty)
- Ensure the server has internet access
- Check console logs for specific error messages

### Slow performance

- Reduce `BATCH_SIZE` to process fewer jobs simultaneously
- Increase wait time between batches (currently 5 seconds)

### Memory issues

- Process fewer jobs at once by modifying the LIMIT in `getJobsNeedingEnrichment()`
- Close other applications while running enrichment

## Technical Details

### Supported Sources

1. **LinkedIn**: Extracts from `.show-more-less-html__markup` and related selectors
2. **Indeed**: Extracts from `#jobDescriptionText` and related selectors
3. **We Work Remotely**: Extracts from `.listing-container-description`
4. **Generic**: Falls back to common patterns for unknown sources

### Database Updates

Only updates jobs where:
- URL is present and valid
- Description is empty, generic, or less than 100 characters
- Current description matches common placeholder text

## Example Output

```
🔍 Starting Job Enrichment Process...

📊 Found 15 jobs needing enrichment

📦 Processing batch 1/3
   Jobs 1-5 of 15

  Fetching: https://www.linkedin.com/jobs/view/123456
  ✅ Enriched: Senior Software Engineer (TechCorp)
  Fetching: https://www.indeed.com/viewjob?jk=789012
  ✅ Enriched: DevOps Specialist (CloudServices Inc)
  ...

============================================================
📈 Enrichment Summary:
   Total jobs processed: 15
   ✅ Successfully enriched: 13
   ❌ Failed: 2
============================================================
```
