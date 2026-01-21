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
    
    // LinkedIn has multiple possible selectors depending on view/layout
    const jobCardSelectors = [
        '.job-card-container',                    // Classic view
        '.jobs-search-results__list-item',        // Updated search results
        '.scaffold-layout__list-item',            // Newer layout
        'li.jobs-search-results__list-item',      // More specific
        'div[data-job-id]'                         // Direct job card with ID
    ];
    
    let jobCards = [];
    for (const selector of jobCardSelectors) {
        jobCards = document.querySelectorAll(selector);
        if (jobCards.length > 0) {
            console.warn(`LinkedIn: Found ${jobCards.length} jobs using selector: ${selector}`);
            break;
        }
    }

    if (jobCards.length === 0) {
        console.warn("LinkedIn: No job cards found with any known selectors");
        return jobs;
    }

    jobCards.forEach(card => {
        try {
            // 1. Job Title & Link - Multiple possible selectors
            const titleSelectors = [
                '.job-card-list__title--link',
                '.job-card-list__title',
                '.job-card-container__link',
                '.disabled-ember-anchor',
                'a.job-card-container__link',
                '.base-card__full-link',
                '.base-search-card__title',
                'a[data-tracking-control-name*="job"]'
            ];
            
            let title = "Unknown Title";
            let link = "#";
            let titleElement = null;
            
            for (const selector of titleSelectors) {
                titleElement = card.querySelector(selector);
                if (titleElement) break;
            }
            
            if (titleElement) {
                title = titleElement.innerText.trim();
                if (titleElement.tagName.toLowerCase() === 'a') {
                    link = titleElement.href;
                } else {
                    // Sometimes the link is on a parent or sibling
                    const linkAnchor = card.querySelector('a[href*="/jobs/view/"]');
                    if (linkAnchor) link = linkAnchor.href;
                }
            }

            // 2. Company Name - Multiple possible selectors
            const companySelectors = [
                '.artdeco-entity-lockup__subtitle',
                '.job-card-container__company-name',
                '.base-search-card__subtitle',
                'a.job-card-container__company-link',
                '.job-card-container__primary-description'
            ];
            
            let company = "Unknown Company";
            let companyElement = null;
            
            for (const selector of companySelectors) {
                companyElement = card.querySelector(selector);
                if (companyElement) break;
            }
            
            if (companyElement) {
                company = companyElement.innerText.trim();
            }

            // 3. Location - Multiple possible selectors
            const locationSelectors = [
                '.job-card-container__metadata-wrapper li',
                '.job-card-container__metadata-item',
                '.base-search-card__metadata',
                '.job-search-card__location'
            ];
            
            let location = "Remote/Unknown";
            let locationElement = null;
            
            for (const selector of locationSelectors) {
                locationElement = card.querySelector(selector);
                if (locationElement) break;
            }
            
            if (locationElement) {
                location = locationElement.innerText.trim();
            }

            // 4. Logo Image
            const imgElement = card.querySelector('.job-card-list__logo img, .ivm-view-attr__img--centered, img.artdeco-entity-image, .job-card-square-logo img');
            let image = "";
            if (imgElement) {
                image = imgElement.src;
            }

            // 5. Salary Range - Look for spans with dir="ltr" containing salary info
            let salary = "Not listed";
            
            // First, try the metadata section with class artdeco-entity-lockup__metadata
            const metadataSection = card.querySelector('.artdeco-entity-lockup__metadata');
            if (metadataSection) {
                const metadataText = metadataSection.innerText.trim();
                console.warn(`LinkedIn: Checking metadata section: "${metadataText}"`);
                
                // Look for salary pattern in this section
                const salaryMatch = metadataText.match(/\$\d+[.,]?\d*[KkMm]?(\/yr)?(\s*-\s*\$\d+[.,]?\d*[KkMm]?(\/yr)?)?/);
                if (salaryMatch) {
                    salary = salaryMatch[0];
                    console.warn(`LinkedIn: Found salary in metadata section: ${salary}`);
                }
            }
            
            // If not found, check all spans with dir="ltr" for salary patterns
            if (salary === "Not listed") {
                const allSpans = card.querySelectorAll('span[dir="ltr"]');
                console.warn(`LinkedIn: Checking ${allSpans.length} spans for salary`);
                
                for (const span of allSpans) {
                    const text = span.innerText.trim();
                    // Look for salary patterns like "$101K/yr - $120.4K/yr" or "$100,000 - $150,000"
                    if (text.match(/\$\d+[.,]?\d*[KkMm]?(\/yr)?(\s*-\s*\$\d+[.,]?\d*[KkMm]?(\/yr)?)?/)) {
                        salary = text;
                        console.warn(`LinkedIn: Found salary in span: ${salary}`);
                        break;
                    }
                }
            }
            
            // If not found, check metadata list items
            if (salary === "Not listed") {
                const metadataItems = card.querySelectorAll('.job-card-container__metadata-wrapper li, .artdeco-entity-lockup__metadata li');
                console.warn(`LinkedIn: Checking ${metadataItems.length} metadata items for salary`);
                
                for (const item of metadataItems) {
                    const text = item.innerText.trim();
                    if (text.match(/\$\d+[.,]?\d*[KkMm]?(\/yr)?(\s*-\s*\$\d+[.,]?\d*[KkMm]?(\/yr)?)?/)) {
                        salary = text;
                        console.warn(`LinkedIn: Found salary in metadata item: ${salary}`);
                        break;
                    }
                }
            }
            
            // Clean salary text - extract just the salary part, remove benefits info
            if (salary !== "Not listed") {
                // Extract just the salary part before any · or other separators
                const salaryMatch = salary.match(/\$\d+[.,]?\d*[KkMm]?(\/yr)?(\s*-\s*\$\d+[.,]?\d*[KkMm]?(\/yr)?)?/);
                if (salaryMatch) {
                    salary = salaryMatch[0];
                    console.warn(`LinkedIn: Cleaned salary: ${salary}`);
                }
            } else {
                console.warn('LinkedIn: No salary found for this job');
            }

            // 6. Easy Apply - Look for spans with dir="ltr" containing "Easy Apply"
            let isEasyApply = false;
            
            console.warn('LinkedIn: Checking for Easy Apply...');
            
            // Check all spans with dir="ltr" for "Easy Apply" text
            const footerSpans = card.querySelectorAll('.job-card-container__footer-wrapper span[dir="ltr"], .job-card-list__footer-wrapper span[dir="ltr"]');
            console.warn(`LinkedIn: Found ${footerSpans.length} footer spans to check`);
            
            for (const span of footerSpans) {
                const text = span.innerText.trim().toLowerCase();
                console.warn(`LinkedIn: Footer span text: "${text}"`);
                if (text === 'easy apply') {
                    isEasyApply = true;
                    console.warn('LinkedIn: ✓ Found Easy Apply badge');
                    break;
                }
            }
            
            // Fallback: check for Easy Apply in footer items
            if (!isEasyApply) {
                const footerItems = card.querySelectorAll('.job-card-container__footer-wrapper li, .job-card-list__footer-wrapper li');
                console.warn(`LinkedIn: Checking ${footerItems.length} footer items`);
                
                for (const item of footerItems) {
                    const text = item.innerText?.toLowerCase() || '';
                    if (text.includes('easy apply')) {
                        isEasyApply = true;
                        console.warn('LinkedIn: ✓ Found Easy Apply in footer item');
                        break;
                    }
                }
            }
            
            // Final fallback: check entire card for Easy Apply text
            if (!isEasyApply) {
                const cardText = card.innerText.toLowerCase();
                if (cardText.includes('easy apply')) {
                    isEasyApply = true;
                    console.warn('LinkedIn: ✓ Found Easy Apply in card text (fallback)');
                }
            }
            
            if (!isEasyApply) {
                console.warn('LinkedIn: ✗ No Easy Apply found for this job');
            }

            // 7. Job ID (from data attribute)
            let jobId = card.getAttribute('data-job-id') || 
                        card.getAttribute('data-occludable-job-id') ||
                        card.querySelector('[data-job-id]')?.getAttribute('data-job-id');
            
            if (!jobId) {
                // Try to extract from URL
                const match = link.match(/\/jobs\/view\/(\d+)/);
                jobId = match ? match[1] : 'li-' + Math.random().toString(36).substr(2, 9);
            }

            if (title !== "Unknown Title") {
                jobs.push({
                    id: jobId,
                    title,
                    company,
                    location,
                    salary,
                    easyApply: isEasyApply,
                    url: link,
                    image,
                    source: 'LinkedIn'
                });
            }
        } catch (e) {
            console.error("LinkedIn Scraper: Error parsing a job card", e);
        }
    });

    console.warn(`LinkedIn: Successfully scraped ${jobs.length} jobs`);
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
