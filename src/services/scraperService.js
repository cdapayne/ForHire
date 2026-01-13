const puppeteer = require('puppeteer');

/**
 * Scrapes jobs from We Work Remotely based on a search term.
 * Note: Scraping relies on the specific HTML structure of the target site.
 * If the site updates its design, this scraper will need to be updated.
 */
const scrapeWeWorkRemotely = async (search) => {
    console.log(`Scraping We Work Remotely for: ${search}...`);
    
    // Launch browser
    const browser = await puppeteer.launch({
        headless: "new", // Opt into new headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Go to search page
        // Usage: https://weworkremotely.com/remote-jobs/search?term=javascript
        const baseUrl = 'https://weworkremotely.com/remote-jobs/search';
        const url = `${baseUrl}?term=${encodeURIComponent(search)}`;
        
        // Set a reasonable timeout and user agent to avoid being blocked immediately
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Scrape the data
        const jobs = await page.evaluate(() => {
            const jobNodes = document.querySelectorAll('section.jobs article li');
            const scrapedData = [];

            jobNodes.forEach(node => {
                // Skip the "view all" buttons or feature headers often found in the list
                if (node.classList.contains('view-all') || node.classList.contains('feature')) {
                    // Sometimes feature jobs utilize the same structure, check for 'a' tag
                    if (!node.querySelector('a')) return;
                }

                // WWR structure: 
                // <li>
                //   <a href="/remote-jobs/...">
                //     <span class="company">Company Name</span>
                //     <span class="title">Job Title</span>
                //     <span class="region">Location</span>
                //   </a>
                // </li>

                const anchor = node.querySelector('a');
                if (!anchor) return;

                const companyNode = node.querySelector('.company');
                const titleNode = node.querySelector('.title');
                const regionNode = node.querySelector('.region'); // Sometimes used for date or location

                if (titleNode && companyNode) {
                    scrapedData.push({
                        id: 'wwr-' + Math.random().toString(36).substr(2, 9), // Generate temp ID
                        title: titleNode.innerText.trim(),
                        company: companyNode.innerText.trim(),
                        location: regionNode ? regionNode.innerText.trim() : 'Remote',
                        type: 'Full-Time', // WWR is predominantly full-time
                        salary: 'See details', // Usually hidden
                        posted: 'Recently',
                        description: 'Job scraped from We Work Remotely. Click Apply to see full details.',
                        url: 'https://weworkremotely.com' + anchor.getAttribute('href'),
                        source: 'We Work Remotely'
                    });
                }
            });

            return scrapedData;
        });

        console.log(`Found ${jobs.length} jobs on We Work Remotely`);
        return jobs;

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};

/**
 * Scrapes cybersecurity jobs from RemoteOK.
 */
const scrapeRemoteOK = async (search) => {
    console.log(`Scraping RemoteOK for: ${search}...`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // RemoteOK URL structure
        // https://remoteok.com/remote-[search]-jobs
        // Clean search term to be URL friendly (e.g., "cyber security" -> "cyber-security")
        const formattedSearch = search.toLowerCase().replace(/\s+/g, '-');
        const url = `https://remoteok.com/remote-${formattedSearch}-jobs`;
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // RemoteOK can be slow, increase timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const jobs = await page.evaluate(() => {
            // RemoteOK uses <tr> elements with class 'job'
            const jobRows = document.querySelectorAll('tr.job');
            const scrapedData = [];

            jobRows.forEach(row => {
                if (row.classList.contains('do-not-expand')) return; // Skip closed/hidden jobs

                const titleNode = row.querySelector('.company_and_position h2');
                const companyNode = row.querySelector('.company_and_position h3');
                const locationNode = row.querySelector('.location'); 
                const anchor = row.getAttribute('data-url') || row.querySelector('.preventLink'); // Sometimes link is on row or inner a

                if (titleNode && companyNode) {
                    // Extract Salary if present in tags
                    // RemoteOK puts salary in div.location usually alongside location
                    let salary = 'Competitive';
                    const locationsAndTags = row.querySelectorAll('.location');
                    let locations = [];
                    locationsAndTags.forEach(tag => {
                        if (tag.innerText.includes('$')) {
                            salary = tag.innerText;
                        } else {
                            locations.push(tag.innerText);
                        }
                    });

                    let jobUrl = '';
                    if (row.getAttribute('data-href')) {
                        jobUrl = 'https://remoteok.com' + row.getAttribute('data-href');
                    } else if (anchor && anchor.getAttribute('href')) {
                         jobUrl = 'https://remoteok.com' + anchor.getAttribute('href');
                    } else {
                        // Fallback using ID
                        const id = row.getAttribute('data-id');
                        if (id) jobUrl = `https://remoteok.com/l/${id}`;
                    }

                    scrapedData.push({
                        id: 'rok-' + row.getAttribute('data-id'),
                        title: titleNode.innerText.trim(),
                        company: companyNode.innerText.trim(),
                        location: locations.length > 0 ? locations[0] : 'Remote',
                        type: 'Contract/Full-time', // RemoteOK is mixed
                        salary: salary,
                        posted: 'Recently',
                        description: 'Job scraped from RemoteOK. Click Apply to see full details.',
                        url: jobUrl,
                        source: 'RemoteOK'
                    });
                }
            });
            return scrapedData;
        });

        console.log(`Found ${jobs.length} jobs on RemoteOK`);
        return jobs;

    } catch (error) {
        console.error('RemoteOK Scraping Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};

module.exports = {
    scrapeWeWorkRemotely,
    scrapeRemoteOK
};
