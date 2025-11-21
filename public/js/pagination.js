// Pagination state
let currentPage = 1;
let itemsPerPage = 5;
let totalItems = 0;
let filteredData = [];

// Initialize pagination
function initPagination(data) {
    filteredData = data;
    totalItems = data.length;
    updatePagination();
    displayCurrentPage();
}

// Update pagination UI
function updatePagination() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    // Update button states
    document.getElementById('firstPage').disabled = currentPage === 1;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
    document.getElementById('lastPage').disabled = currentPage === totalPages;
}

// Display current page data
function displayCurrentPage() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);
    
    // Update table with page data
    updateTable(pageData);
}

// Event listeners for pagination buttons
document.addEventListener('DOMContentLoaded', function() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const firstButton = document.getElementById('firstPage');
    const lastButton = document.getElementById('lastPage');
    
    if (prevButton && nextButton && firstButton && lastButton) {
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                updatePagination();
                displayCurrentPage();
            }
        });
        nextButton.addEventListener('click', () => {
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                updatePagination();
                displayCurrentPage();
            }
        });
        firstButton.addEventListener('click', () => {
            if (currentPage !== 1) {
                currentPage = 1;
                updatePagination();
                displayCurrentPage();
            }
        });
        lastButton.addEventListener('click', () => {
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            if (currentPage !== totalPages) {
                currentPage = totalPages;
                updatePagination();
                displayCurrentPage();
            }
        });
    }
});

// Reset pagination when filters are applied
function resetPagination() {
    currentPage = 1;
    updatePagination();
    displayCurrentPage();
}

// Export functions for use in other files
window.pagination = {
    init: initPagination,
    reset: resetPagination
};