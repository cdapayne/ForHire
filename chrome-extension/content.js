// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape_jobs") {
        const jobs = scrapeJobsFromPage();
        sendResponse({ jobs: jobs });
    }
});

function scrapeJobsFromPage() {
    let jobs = [];
    
    // Pass 1: LinkedIn
    const linkedInJobs = scrapeLinkedIn();
    if (linkedInJobs.length > 0) {
        jobs = [...jobs, ...linkedInJobs];
    }
    
    // Pass 2: Indeed
    const indeedJobs = scrapeIndeed();
    if (indeedJobs.length > 0) {
        jobs = [...jobs, ...indeedJobs];
    }

    console.log(`LMSJobs Scraper: Found ${jobs.length} jobs.`);
    return jobs;
}

function scrapeLinkedIn() {
    const jobs = [];
    const jobCards = document.querySelectorAll('.job-card-container');

    jobCards.forEach(card => {
        try {
            // 1. Job Title & Link
            const titleElement = card.querySelector('.job-card-list__title--link, .job-card-list__title');
            let title = "Unknown Title";
            let link = "#";
            
            if (titleElement) {
                title = titleElement.innerText.trim();
                if (titleElement.tagName.toLowerCase() === 'a') {
                    link = titleElement.href;
                }
            }

            // 2. Company Name
            const companyElement = card.querySelector('.artdeco-entity-lockup__subtitle');
            let company = "Unknown Company";
            if (companyElement) {
                company = companyElement.innerText.trim();
            }

            // 3. Location
            const locationElement = card.querySelector('.job-card-container__metadata-wrapper li, .job-card-container__metadata-item');
            let location = "Remote/Unknown";
            if (locationElement) {
                location = locationElement.innerText.trim();
            }

            // 4. Logo Image
            const imgElement = card.querySelector('.job-card-list__logo img, .ivm-view-attr__img--centered');
            let image = "";
            if (imgElement) {
                image = imgElement.src;
            }

            // 5. Job ID (from data attribute)
            const jobId = card.getAttribute('data-job-id') || 'li-' + Math.random().toString(36).substr(2, 9);

            if (title !== "Unknown Title") {
                jobs.push({
                    id: jobId,
                    title,
                    company,
                    location,
                    url: link,
                    image,
                    source: 'LinkedIn'
                });
            }
        } catch (e) {
            console.error("LinkedIn Scraper: Error parsing a job card", e);
        }
    });

    return jobs;
}

function scrapeIndeed() {
    const jobs = [];
    // Container: resultCode or job_seen_beacon. The snippet shows td.resultContent
    const jobCards = document.querySelectorAll('.resultContent, .job_seen_beacon');

    jobCards.forEach(card => {
        try {
            // 1. Title & Link
            const titleElement = card.querySelector('.jobTitle a, a.jcs-JobTitle');
            let title = "Unknown Title";
            let link = "#";
            let jobId = 'ind-' + Math.random().toString(36).substr(2, 9);

            if (titleElement) {
                title = titleElement.innerText.trim();
                link = titleElement.href || "#";
                // Indeed links are often relative if not fully qualified by the browser property
                if (link.startsWith('/')) {
                    link = 'https://www.indeed.com' + link;
                }
                
                // Try to get ID from data-jk
                if (titleElement.getAttribute('data-jk')) {
                    jobId = titleElement.getAttribute('data-jk');
                } else if (titleElement.id) {
                     jobId = titleElement.id.replace('job_', '');
                }
            }

            // 2. Company
            const companyElement = card.querySelector('[data-testid="company-name"]');
            let company = "Unknown Company";
            if (companyElement) {
                company = companyElement.innerText.trim();
            }

            // 3. Location
            const locationElement = card.querySelector('[data-testid="text-location"]');
            let location = "Unknown Location";
            if (locationElement) {
                location = locationElement.innerText.trim();
            }

            // 4. Metadata (Type/Salary)
            // Indeed structure varies, sometimes inside .metadataContainer or .salary-snippet-container
            const metadataItems = card.querySelectorAll('.metadataContainer li, .salary-snippet-container');
            let type = "Full-time"; // Default
            let salary = "Not listed";

            metadataItems.forEach(item => {
                const text = item.innerText.toLowerCase();
                if (text.includes('$') || text.includes('year') || text.includes('hour')) {
                    salary = item.innerText.trim();
                }
                if (text.includes('full-time') || text.includes('contract') || text.includes('part-time')) {
                    type = item.innerText.trim();
                }
            });

            if (title !== "Unknown Title") {
                jobs.push({
                    id: jobId,
                    title,
                    company,
                    location,
                    type,
                    salary,
                    url: link,
                    description: 'View posting for details', // Indeed cards don't show full desc
                    source: 'Indeed'
                });
            }

        } catch (e) {
            console.error("Indeed Scraper: Error parsing a job card", e);
        }
    });
    
    return jobs;
}
