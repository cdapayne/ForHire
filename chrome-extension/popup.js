// Load config
let config = null;
let commonGeoIds = null;
let allJobs = [];
let isRunning = false;
let currentLocationIndex = 0;
let currentKeywordIndex = 0;
let selectedLocations = [];

// Load the config when popup opens
fetch(chrome.runtime.getURL('config.json'))
    .then(response => response.json())
    .then(data => {
        config = data;
        console.log('Config loaded:', config);
    })
    .catch(err => {
        console.error('Failed to load config:', err);
        showError('Failed to load configuration file');
    });

// Load common geoIds
fetch(chrome.runtime.getURL('common-geoids.json'))
    .then(response => response.json())
    .then(data => {
        commonGeoIds = data;
        console.log('Common GeoIDs loaded');
        populateStateCheckboxes();
    })
    .catch(err => {
        console.error('Failed to load common-geoids:', err);
        showError('Failed to load location database');
    });

// Populate state checkboxes
function populateStateCheckboxes() {
    const container = document.getElementById('stateCheckboxes');
    const states = Object.keys(commonGeoIds).sort();
    
    states.forEach(stateKey => {
        const cities = commonGeoIds[stateKey];
        const stateName = formatStateName(stateKey);
        
        const label = document.createElement('label');
        label.className = 'state-checkbox';
        label.innerHTML = `
            <input type="checkbox" value="${stateKey}">
            <span>${stateName}</span>
            <span class="city-count">(${cities.length} cities)</span>
        `;
        container.appendChild(label);
    });
}

function formatStateName(key) {
    return key.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Radio button change handler
document.querySelectorAll('input[name="locationMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const stateSelector = document.getElementById('stateSelector');
        if (e.target.value === 'select') {
            stateSelector.style.display = 'block';
        } else {
            stateSelector.style.display = 'none';
        }
    });
});

// State search functionality
document.getElementById('stateSearch').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const checkboxes = document.querySelectorAll('.state-checkbox');
    
    checkboxes.forEach(checkbox => {
        const stateName = checkbox.querySelector('span').textContent.toLowerCase();
        if (stateName.includes(searchTerm)) {
            checkbox.style.display = 'flex';
        } else {
            checkbox.style.display = 'none';
        }
    });
});

// Select all states
document.getElementById('selectAllStates').addEventListener('click', () => {
    document.querySelectorAll('.state-checkbox input[type="checkbox"]').forEach(cb => {
        if (cb.parentElement.style.display !== 'none') {
            cb.checked = true;
        }
    });
});

// Clear all states
document.getElementById('clearAllStates').addEventListener('click', () => {
    document.querySelectorAll('.state-checkbox input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
});

// Start button handler
document.getElementById('startBtn').addEventListener('click', async () => {
    if (!config || !config.keywords || config.keywords.length === 0) {
        showError('No keywords configured in config.json');
        return;
    }

    if (!commonGeoIds) {
        showError('Location database not loaded. Please refresh the extension.');
        return;
    }

    // Determine which locations to use
    const locationMode = document.querySelector('input[name="locationMode"]:checked').value;
    
    if (locationMode === 'all') {
        // Use all locations from common-geoids.json
        selectedLocations = [];
        Object.values(commonGeoIds).forEach(cities => {
            selectedLocations = [...selectedLocations, ...cities];
        });
    } else {
        // Use selected states
        const checkedStates = Array.from(
            document.querySelectorAll('.state-checkbox input[type="checkbox"]:checked')
        ).map(cb => cb.value);
        
        if (checkedStates.length === 0) {
            showError('Please select at least one state');
            return;
        }
        
        selectedLocations = [];
        checkedStates.forEach(stateKey => {
            selectedLocations = [...selectedLocations, ...commonGeoIds[stateKey]];
        });
    }

    console.log(`Starting scrape with ${selectedLocations.length} locations and ${config.keywords.length} keywords`);
    console.log(`Total searches: ${selectedLocations.length * config.keywords.length}`);

    isRunning = true;
    allJobs = [];
    currentLocationIndex = 0;
    currentKeywordIndex = 0;
    
    // Update UI
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('jobList').innerHTML = '';
    document.querySelector('.progress-section').style.display = 'block';
    updateJobCount(0);
    hideError();
    
    // Start scraping process
    await scrapeNextLocation();
});

// Stop button handler
document.getElementById('stopBtn').addEventListener('click', () => {
    isRunning = false;
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('startBtn').style.display = 'inline-block';
    updateStatus('Stopped by user');
    document.querySelector('.progress-section').style.display = 'none';
    
    // Show buttons if we have jobs
    if (allJobs.length > 0) {
        document.getElementById('copyBtn').style.display = 'inline-block';
        document.getElementById('uploadBtn').style.display = 'inline-block';
    }
});

async function scrapeNextLocation() {
    if (!isRunning || currentLocationIndex >= selectedLocations.length) {
        // Done with all locations
        isRunning = false;
        document.getElementById('stopBtn').style.display = 'none';
        document.getElementById('startBtn').style.display = 'inline-block';
        document.getElementById('currentLocation').textContent = 'Complete!';
        document.querySelector('.progress-section').style.display = 'none';
        updateStatus(`✅ Finished! Scraped ${allJobs.length} total jobs`);
        
        // Auto-upload if enabled
        const autoUpload = document.getElementById('autoUpload').checked;
        if (autoUpload && allJobs.length > 0) {
            updateStatus('⬆️ Auto-uploading to database...');
            await uploadToDatabase();
        }
        
        // Show action buttons
        if (allJobs.length > 0) {
            document.getElementById('copyBtn').style.display = 'inline-block';
            document.getElementById('uploadBtn').style.display = 'inline-block';
        }
        return;
    }

    const location = selectedLocations[currentLocationIndex];
    currentKeywordIndex = 0;
    document.getElementById('currentLocation').textContent = location.name;
    
    // Start scraping keywords for this location
    await scrapeNextKeyword();
}

async function scrapeNextKeyword() {
    if (!isRunning) return;
    
    const location = selectedLocations[currentLocationIndex];
    
    // Check if we're done with keywords for this location
    if (currentKeywordIndex >= config.keywords.length) {
        // Move to next location
        currentLocationIndex++;
        await scrapeNextLocation();
        return;
    }

    const keyword = config.keywords[currentKeywordIndex];
    
    // Update progress
    const totalSearches = selectedLocations.length * config.keywords.length;
    const completedSearches = (currentLocationIndex * config.keywords.length) + currentKeywordIndex;
    const progress = Math.round((completedSearches / totalSearches) * 100);
    
    updateProgress(progress, completedSearches + 1, totalSearches);
    updateStepInfo(location.name, keyword, currentKeywordIndex + 1, config.keywords.length);
    updateStatus(`🔍 Navigating to LinkedIn...`);

    try {
        // Build LinkedIn URL
        const encodedKeyword = encodeURIComponent(keyword);
        let linkedinUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedKeyword}&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&refresh=true`;
        
        // Add location
        if (location.geoId) {
            linkedinUrl += `&geoId=${location.geoId}`;
        }
        
        // Add filters based on user selection
        const remoteOnly = document.getElementById('remoteOnly').checked;
        const easyApplyOnly = document.getElementById('easyApplyOnly').checked;
        
        if (remoteOnly) {
            linkedinUrl += `&f_WT=2`;
        }
        
        if (easyApplyOnly) {
            linkedinUrl += `&f_AL=true`;
        }
        
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showError('No active tab found. Please open a browser tab.');
            return;
        }
        
        // Navigate to the URL
        await chrome.tabs.update(tab.id, { url: linkedinUrl });
        
        // Wait for page to load and scrape
        setTimeout(async () => {
            if (!isRunning) return;
            
            await scrapeCurrentPage();
            
            // Move to next keyword
            currentKeywordIndex++;
            
            // Wait before next search
            setTimeout(() => {
                if (isRunning) {
                    scrapeNextKeyword();
                }
            }, config.delayBetweenSearches || 3000);
            
        }, 5000); // Wait 5 seconds for page to load
        
    } catch (error) {
        console.error('Error in scrapeNextKeyword:', error);
        showError(`Navigation error: ${error.message}`);
        // Try to continue with next keyword
        currentKeywordIndex++;
        setTimeout(() => {
            if (isRunning) scrapeNextKeyword();
        }, 2000);
    }
}

async function scrapeCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    updateStatus('📋 Scraping current page...');
    
    try {
        chrome.tabs.sendMessage(tab.id, { action: "scrape_jobs" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Scraping error:', chrome.runtime.lastError);
                showError('Unable to scrape page. Make sure you\'re logged into LinkedIn.');
                return;
            }

            if (response && response.jobs && response.jobs.length > 0) {
                // Add new jobs to our collection
                allJobs = [...allJobs, ...response.jobs];
                updateJobCount(allJobs.length);
                updateStatus(`✅ Found ${response.jobs.length} jobs on this page`);
                
                // Render the new jobs
                renderJobs(response.jobs);
            } else {
                updateStatus('ℹ️ No jobs found on this page');
            }
        });
    } catch (error) {
        console.error('Error scraping page:', error);
        showError(`Scraping error: ${error.message}`);
    }
}

function updateProgress(percent, current, total) {
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressText').textContent = `Search ${current} of ${total}`;
    document.getElementById('progressPercent').textContent = percent + '%';
}

function updateStepInfo(location, keyword, keywordNum, totalKeywords) {
    document.getElementById('currentStep').textContent = 
        `📍 ${location} - Keyword ${keywordNum}/${totalKeywords}: "${keyword}"`;
}

function showError(message) {
    const errorEl = document.getElementById('errorMsg');
    errorEl.textContent = '⚠️ ' + message;
    errorEl.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMsg').style.display = 'none';
}

function updateJobCount(count) {
    document.getElementById('jobCount').textContent = count;
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// Copy button handler
document.getElementById('copyBtn').addEventListener('click', () => {
    const json = JSON.stringify(allJobs, null, 2);
    navigator.clipboard.writeText(json).then(() => {
        updateStatus('Copied JSON to clipboard!');
        setTimeout(() => updateStatus(`Found ${allJobs.length} jobs!`), 2000);
    });
});

// Upload button handler
document.getElementById('uploadBtn').addEventListener('click', async () => {
    await uploadToDatabase();
});

// Reusable upload function
async function uploadToDatabase() {
    const uploadBtn = document.getElementById('uploadBtn');
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        const res = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(allJobs)
        });
        
        const data = await res.json();
        
        if (res.ok) {
            updateStatus(`✅ Success! Added ${data.added} new jobs to database.`);
            uploadBtn.textContent = 'Uploaded ✓';
        } else {
            updateStatus('❌ Upload failed.');
            uploadBtn.textContent = 'Retry Upload';
            showError('Failed to upload jobs to database');
        }
    } catch (err) {
        console.error(err);
        updateStatus('❌ Error connecting to server.');
        uploadBtn.textContent = 'Retry Upload';
        showError('Cannot connect to server. Make sure it\'s running on localhost:3000');
    }
}

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
