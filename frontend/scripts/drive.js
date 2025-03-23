async function fetchDriveFiles() {
    try {
        const response = await fetch('http://localhost:8000/listFiles');
        const files = await response.json();

        const fileListElement = document.getElementById('fileList');

        if (files.message) {
            fileListElement.innerHTML = '<p>No files found.</p>';
        } else {
            files.forEach(file => {
                const fileElement = document.createElement('div');
                fileElement.classList.add('file-item');

                fileElement.innerHTML = `
                    <img src="${file.iconLink}" alt="icon" class="file-icon" />
                    <a href="${file.webViewLink}" target="_blank" class="file-link">${file.name}</a>
                `;
                fileListElement.appendChild(fileElement);
            });
        }
    } catch (error) {
        console.error('Error fetching files:', error);
        document.getElementById('fileList').innerHTML = '<p>Failed to load files.</p>';
    }
}

document.addEventListener('DOMContentLoaded', fetchDriveFiles);
