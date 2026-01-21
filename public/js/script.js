document.addEventListener('DOMContentLoaded', () => {
    console.log('MD Technical Job Board Frontend Loaded');
    initializeFilters();
    initializeSorting();
    initializeEnrichButton();
});

function initializeFilters() {
    const jobCards = document.querySelectorAll('.job-card');
    
    // Populate filter dropdowns with unique values from jobs
    populateFilterOptions(jobCards);
    
    // Add event listeners to all filter dropdowns
    const companyFilter = document.getElementById('companyFilter');
    const locationFilter = document.getElementById('locationFilter');
    const typeFilter = document.getElementById('typeFilter');
    const salaryFilter = document.getElementById('salaryFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const easyApplyFilter = document.getElementById('easyApplyFilter');
    const clearFiltersBtn = document.getElementById('clearFilters');
    
    if (companyFilter) companyFilter.addEventListener('change', applyFilters);
    if (locationFilter) locationFilter.addEventListener('change', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (salaryFilter) salaryFilter.addEventListener('change', applyFilters);
    if (sourceFilter) sourceFilter.addEventListener('change', applyFilters);
    if (easyApplyFilter) easyApplyFilter.addEventListener('change', applyFilters);
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (companyFilter) companyFilter.value = '';
            if (locationFilter) locationFilter.value = '';
            if (typeFilter) typeFilter.value = '';
            if (salaryFilter) salaryFilter.value = '';
            if (sourceFilter) sourceFilter.value = '';
            if (easyApplyFilter) easyApplyFilter.checked = false;
            applyFilters();
        });
    }
}

function populateFilterOptions(jobCards) {
    const companies = new Set();
    const locations = new Set();
    
    jobCards.forEach(card => {
        const company = card.getAttribute('data-company');
        const location = card.getAttribute('data-location');
        
        if (company) companies.add(company);
        if (location) locations.add(location);
    });
    
    // Populate company dropdown
    const companyFilter = document.getElementById('companyFilter');
    if (companyFilter) {
        Array.from(companies).sort().forEach(company => {
            const option = document.createElement('option');
            option.value = company;
            option.textContent = company;
            companyFilter.appendChild(option);
        });
    }
    
    // Populate location dropdown
    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter) {
        Array.from(locations).sort().forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            locationFilter.appendChild(option);
        });
    }
}

function applyFilters() {
    const companyValue = document.getElementById('companyFilter')?.value || '';
    const locationValue = document.getElementById('locationFilter')?.value || '';
    const typeValue = document.getElementById('typeFilter')?.value || '';
    const salaryValue = document.getElementById('salaryFilter')?.value || '';
    const sourceValue = document.getElementById('sourceFilter')?.value || '';
    const easyApplyOnly = document.getElementById('easyApplyFilter')?.checked || false;
    
    const jobCards = document.querySelectorAll('.job-card');
    let visibleCount = 0;
    
    jobCards.forEach(card => {
        const company = card.getAttribute('data-company') || '';
        const location = card.getAttribute('data-location') || '';
        const type = card.getAttribute('data-type') || '';
        const salary = card.getAttribute('data-salary') || '';
        const source = card.getAttribute('data-source') || '';
        const isEasyApply = card.getAttribute('data-easy-apply') === 'true';
        
        let matches = true;
        
        // Check company filter
        if (companyValue && company !== companyValue) {
            matches = false;
        }
        
        // Check location filter
        if (locationValue && location !== locationValue) {
            matches = false;
        }
        
        // Check type filter
        if (typeValue && type !== typeValue) {
            matches = false;
        }
        
        // Check salary filter
        if (salaryValue && !matchesSalaryRange(salary, salaryValue)) {
            matches = false;
        }
        
        // Check source filter
        if (sourceValue && source !== sourceValue) {
            matches = false;
        }
        
        // Check Easy Apply filter
        if (easyApplyOnly && !isEasyApply) {
            matches = false;
        }
        
        // Show or hide card
        if (matches) {
            card.classList.remove('hidden');
            visibleCount++;
        } else {
            card.classList.add('hidden');
        }
    });
    
    // Update job count
    const jobCount = document.getElementById('jobCount');
    if (jobCount) {
        jobCount.textContent = visibleCount;
    }
}

function matchesSalaryRange(salaryText, range) {
    // Extract numeric value from salary text
    const match = salaryText.match(/\$?([\d,]+)/);
    if (!match) return false;
    
    const salary = parseInt(match[1].replace(/,/g, ''));
    const [min, max] = range.split('-').map(val => parseInt(val));
    
    return salary >= min && salary <= max;
}

function initializeSorting() {
    const sortSelect = document.getElementById('sortSelect');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortJobs(e.target.value);
        });
    }
}

function sortJobs(sortBy) {
    const jobListings = document.querySelector('.job-listings');
    const jobCards = Array.from(document.querySelectorAll('.job-card'));
    const resultsHeader = document.querySelector('.results-header');
    
    jobCards.sort((a, b) => {
        switch (sortBy) {
            case 'recent':
                // Keep original order (most recent first)
                return 0;
                
            case 'salary-high':
                return extractSalaryValue(b) - extractSalaryValue(a);
                
            case 'salary-low':
                return extractSalaryValue(a) - extractSalaryValue(b);
                
            case 'company':
                const companyA = (a.getAttribute('data-company') || '').toLowerCase();
                const companyB = (b.getAttribute('data-company') || '').toLowerCase();
                return companyA.localeCompare(companyB);
                
            case 'title':
                const titleA = (a.querySelector('h4')?.textContent || '').toLowerCase();
                const titleB = (b.querySelector('h4')?.textContent || '').toLowerCase();
                return titleA.localeCompare(titleB);
                
            default:
                return 0;
        }
    });
    
    // Re-append sorted cards
    jobCards.forEach(card => {
        jobListings.appendChild(card);
    });
    
    // Move results header back to top
    if (resultsHeader) {
        jobListings.insertBefore(resultsHeader, jobListings.firstChild);
    }
}

function extractSalaryValue(card) {
    const salaryText = card.getAttribute('data-salary') || '';
    const match = salaryText.match(/\$?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, '')) : 0;
}

function initializeEnrichButton() {
    const enrichBtn = document.getElementById('enrichBtn');
    
    if (enrichBtn) {
        enrichBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const icon = enrichBtn.querySelector('i');
            const originalText = enrichBtn.innerHTML;
            
            // Show loading state
            enrichBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enriching...';
            enrichBtn.style.pointerEvents = 'none';
            
            try {
                const response = await fetch('/api/enrich', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    enrichBtn.innerHTML = '<i class="fas fa-check"></i> Started!';
                    setTimeout(() => {
                        enrichBtn.innerHTML = originalText;
                        enrichBtn.style.pointerEvents = 'auto';
                        alert('Job enrichment started! This will run in the background. Check back in a few minutes and refresh the page to see updated descriptions.');
                    }, 2000);
                } else {
                    throw new Error(data.error || 'Enrichment failed');
                }
            } catch (error) {
                console.error('Enrichment error:', error);
                enrichBtn.innerHTML = '<i class="fas fa-times"></i> Failed';
                setTimeout(() => {
                    enrichBtn.innerHTML = originalText;
                    enrichBtn.style.pointerEvents = 'auto';
                }, 2000);
                alert('Failed to start enrichment. Please try again.');
            }
        });
    }
}
