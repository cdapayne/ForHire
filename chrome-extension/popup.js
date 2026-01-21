document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const statusMsg = document.getElementById('status');
    const listContainer = document.getElementById('jobList');
    const copyBtn = document.getElementById('copyBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    
    statusMsg.textContent = 'Scraping...';
    listContainer.innerHTML = '';
    copyBtn.style.display = 'none';
    uploadBtn.style.display = 'none';

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
        statusMsg.textContent = 'No active tab found.';
        return;
    }

    // Execute script on the page
    chrome.tabs.sendMessage(tab.id, { action: "scrape_jobs" }, (response) => {
        if (chrome.runtime.lastError) {
            statusMsg.textContent = 'Error: Refresh page or navigate to a supported job site (LinkedIn or Indeed).';
            console.error(chrome.runtime.lastError);
            return;
        }

        if (response && response.jobs && response.jobs.length > 0) {
            statusMsg.textContent = `Found ${response.jobs.length} jobs!`;
            renderJobs(response.jobs);
            
            // Show buttons
            copyBtn.style.display = 'inline-block';
            uploadBtn.style.display = 'inline-block';
            
            // Handle copy
            copyBtn.onclick = () => {
                const json = JSON.stringify(response.jobs, null, 2);
                navigator.clipboard.writeText(json).then(() => {
                    statusMsg.textContent = 'Copied JSON to clipboard!';
                    setTimeout(() => statusMsg.textContent = `Found ${response.jobs.length} jobs!`, 2000);
                });
            };

            // Handle upload
            uploadBtn.onclick = async () => {
                uploadBtn.textContent = 'Uploading...';
                try {
                    const res = await fetch('http://localhost:3000/api/upload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(response.jobs)
                    });
                    
                    const data = await res.json();
                    
                    if (res.ok) {
                        statusMsg.textContent = `Success! Added ${data.added} new jobs.`;
                        uploadBtn.textContent = 'Uploaded';
                    } else {
                        statusMsg.textContent = 'Upload failed.';
                        uploadBtn.textContent = 'Retry Upload';
                    }
                } catch (err) {
                    console.error(err);
                    statusMsg.textContent = 'Error connecting to server.';
                    uploadBtn.textContent = 'Retry Upload';
                }
            };

        } else {
            statusMsg.textContent = 'No jobs found on this page.';
        }
    });
});

function renderJobs(jobs) {
    const listContainer = document.getElementById('jobList');
    
    jobs.forEach(job => {
        const div = document.createElement('div');
        div.className = 'job-item';
        
        let imgHtml = '';
        if (job.image) {
            imgHtml = `<img src="${job.image}" class="job-logo" alt="Logo">`;
        } else {
            imgHtml = `<div class="job-logo" style="display:flex;align-items:center;justify-content:center;background:#eee"><small>N/A</small></div>`;
        }

        const jobUrl = job.url || job.link || '#';
        const jobTitle = job.title || 'Unknown Job';
        const jobCompany = job.company || 'Unknown Company';
        const jobLocation = job.location || 'Unknown Location';
        const jobSalary = job.salary || 'Not listed';
        const isEasyApply = job.easyApply || false;

        div.innerHTML = `
            ${imgHtml}
            <div class="job-details">
                <a href="${jobUrl}" target="_blank" class="job-title" title="${jobTitle}">${jobTitle}</a>
                <div class="job-company">${jobCompany}</div>
                <div class="job-location">${jobLocation}</div>
                ${jobSalary !== 'Not listed' ? `<div class="job-salary" style="color: #2c974b; font-weight: 600; font-size: 0.9rem;">💰 ${jobSalary}</div>` : ''}
                ${isEasyApply ? `<div class="job-easy-apply" style="color: #00a859; font-weight: 600; font-size: 0.85rem;">⚡ Easy Apply</div>` : ''}
            </div>
        `;
        listContainer.appendChild(div);
    });
}
