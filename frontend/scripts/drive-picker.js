// Google Drive API implementation
let accessToken = null;

const API_KEY = 'drive picker api key';

function initializeSearch() {
    const searchBar = document.getElementById('searchBar');
    searchBar.addEventListener('input', debounce(handleSearch, 300));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleSearch() {
    const searchTerm = document.getElementById('searchBar').value.toLowerCase();
    if (searchTerm.length > 2) {
        searchDrive(searchTerm);
    } else {
        fetchDriveFiles(); // Revert to showing all files when search term is too short
    }
}

async function searchDrive(searchTerm) {
    try {
        const response = await fetch(`/api/searchDrive?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            throw new Error('Failed to search Drive');
        }
        const data = await response.json();
        displayFiles(data);
    } catch (error) {
        console.error('Error searching Drive:', error);
        showAlert('Failed to search Google Drive. Please try again later.', 'error');
    }
}

// Initialize the search functionality when the page loads
document.addEventListener('DOMContentLoaded', initializeSearch);

