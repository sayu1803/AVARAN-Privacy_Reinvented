let currentFolderId = null;
let nextPageToken = null;
let isLoading = false;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setActiveSidebarItem('homeLink');
    fetchDriveFiles();
    setupProfileDropdown();
    fetchUserProfile().then(updateProfileInfo);
    setupProfileIcon();
    checkAuthentication();
    setupPeriodicAuthCheck();
    checkRequiredElements();
    updateEncryptedFilesCount();
    initializeAuthCheck();
    setInitialTheme();
    updateSecurityScore();
    showLoadingOverlay();

});

function setupEventListeners() {
    try {
        const elements = {
            homeLink: document.getElementById('homeLink'),
            dashboardLogo: document.getElementById('dashboardLogo'),
            statisticsLink: document.getElementById('statisticsLink'),
            trashLink: document.getElementById('trashLink'),
            viewProfileLink: document.getElementById('viewProfileLink'),
            profileModalClose: document.querySelector('#profileModal .close'),
            profileButton: document.getElementById('profileButton'),
            uploadButton: document.getElementById('uploadToggle'),
            uploadFileBtn: document.getElementById('uploadFileBtn'),
            uploadEncryptedFileBtn: document.getElementById('uploadEncryptedFileBtn'),
            uploadFolderBtn: document.getElementById('uploadFolderBtn'),
            searchBar: document.getElementById('searchBar'),
            signOutButton: document.getElementById('signOutButton'),
            toggleViewButton: document.getElementById('toggleViewButton'),
            deleteModal: document.getElementById('deleteModal'),
            cancelDeleteBtn: document.getElementById('cancelDelete'),
            confirmDeleteBtn: document.getElementById('confirmDelete'),
            secureFilesLink: document.getElementById('secureFilesLink'),
            encryptionAlgoSelect: document.getElementById('encryptionAlgo'),
            encryptionDescription: document.getElementById('encryptionDescription'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            fileList: document.getElementById('fileList'),
            shareTypeUser: document.getElementById('shareTypeUser'),
            shareTypeAnyone: document.getElementById('shareTypeAnyone'),
            closeShareModal: document.getElementById('closeShareModal'),
            shareForm: document.getElementById('shareForm'),
            changePasswordBtn: document.getElementById('changePasswordBtn'),
            copyEmailBtn: document.getElementById('copyEmailBtn')
        };

        if (elements.homeLink) elements.homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            showFiles();
        });
        if (elements.dashboardLogo) elements.dashboardLogo.addEventListener('click', (e) => {
            e.preventDefault();
            showFiles();
        });
        if (elements.secureFilesLink) elements.secureFilesLink.addEventListener('click', (e) => {
          e.preventDefault();
          showSecureFiles();
        });
        if (elements.statisticsLink) elements.statisticsLink.addEventListener('click', (e) => {
            e.preventDefault();
            showStatistics()
        });
        if (elements.trashLink) elements.trashLink.addEventListener('click', () => alert("Trash functionality not implemented yet."));
        if (elements.viewProfileLink) elements.viewProfileLink.addEventListener('click', showProfileModal);
        if (elements.profileModalClose) elements.profileModalClose.addEventListener('click', hideProfileModal);
        if (elements.profileButton) elements.profileButton.addEventListener('click', toggleProfileDropdown);
        if (elements.uploadButton) elements.uploadButton.addEventListener('click', toggleUploadMenu);
        if (elements.uploadFileBtn) elements.uploadFileBtn.addEventListener('click', (e) => handleFileUpload(e, false));
        if (elements.uploadEncryptedFileBtn) elements.uploadEncryptedFileBtn.addEventListener('click', handleEncryptedFileUpload);
        if (elements.uploadFolderBtn) elements.uploadFolderBtn.addEventListener('click', handleFolderUpload);
        if (elements.searchBar) elements.searchBar.addEventListener('input', () => filterFiles(elements.searchBar.value.toLowerCase()));
        if (elements.signOutButton) elements.signOutButton.addEventListener('click', handleSignOut);
        if (elements.toggleViewButton) elements.toggleViewButton.addEventListener('click', toggleView);
        if (elements.cancelDeleteBtn) elements.cancelDeleteBtn.addEventListener('click', hideDeleteModal);
        if (elements.confirmDeleteBtn) elements.confirmDeleteBtn.addEventListener('click', function(){
            const fileID = deleteModal.dataset.fileId;
            deleteFile(fileID);
            hideDeleteModal();
        });

        if (elements.fileList) elements.fileList.addEventListener('scroll', function () {
            //Check if the user is near the bottom
            if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100) {
                if (!isLoading && nextPageToken) {
                    //Fetch next batch of files using the saved nextPageToken
                    fetchDriveFiles(currentFilter, currentFolderId, nextPageToken);
                }
            }
        });

        if (elements.changePasswordBtn) elements.changePasswordBtn.addEventListener('click', async () => {
          const currentPassword = document.getElementById('currentPassword').value.trim();
          const newPassword = document.getElementById('newPassword').value.trim();
          const confirmPassword = document.getElementById('confirmPassword').value.trim();
          const passwordMessage = document.getElementById('passwordMessage');

          //Clear previous message
          passwordMessage.textContent = '';
          passwordMessage.classList.remove('error', 'success');

          if(!currentPassword || !newPassword || !confirmPassword) {
            passwordMessage.classList.add('error');
            passwordMessage.textContent = 'All fields are required.';
            return;
          }

          if (newPassword !== confirmPassword) {
            passwordMessage.classList.add('error');
            passwordMessage.textContent = 'New passwords do not match.';
            return;
          }

          try {
            const response = await fetch('/api/changePassword', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({currentPassword, newPassword, confirmNewPassword: confirmPassword })
            });
            const result = await response.json();
            if(!response.ok) {
              passwordMessage.classList.add('error');
              passwordMessage.textContent = result.error || 'Error changing password';
            } else {
              passwordMessage.classList.add('success');
              passwordMessage.textContent = result.message || 'Password changes successfully.';
              //Clear the input fields
              document.getElementById('currentPassword').value = '';
              document.getElementById('newPassword').value = '';
              document.getElementById('confirmPassword').value = '';
            }
          } catch (error) {
            console.error('Error changing passwrod: ', error);
            passwordMessage.classList.add('error');
            passwordMessage.textContent = 'An error occurred while chanin the password.';
          }
        })

        // In the setupEventListeners function
        

        if (elements.encryptionAlgoSelect)
            elements.encryptionAlgoSelect.addEventListener("change", handleEncryptionAlgorithmChange)

        const filterButtons = document.querySelectorAll('.file-filters .filter-option');
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                const filter = this.textContent.toLowerCase();
                fetchDriveFiles(filter);
            });
        });

        if (elements.shareTypeUser) elements.shareTypeUser.addEventListener("change", function() {
            document.getElementById("emailField").style.display = "block";
        });

        if (elements.shareTypeAnyone) elements.shareTypeAnyone.addEventListener("change", function() {
            document.getElementById("emailField").style.display = "none";
        });

        if (elements.closeShareModal) elements.closeShareModal.addEventListener("click", closeShareModal);

        if (elements.copyEmailBtn) elements.copyEmailBtn.addEventListener('click', () => {
          const emailText = document.getElementById('contactEmailLink').textContent;
          navigator.clipboard.writeText(emailText)
            .then(() => {
              const btn = document.getElementById('copyEmailBtn');
              const originalText = btn.textContent;
              btn.textContent = "Copied!";
              setTimeout(() => { btn.textContent = originalText; }, 2000);
            })
            .catch(err => {
              console.error('Failed to copy email:', err);
            });
        });

        if (elements.shareForm) elements.shareForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const fileId = document.getElementById("shareFileId").value;
            const shareType = document.querySelector('input[name="shareType"]:checked').value;
            const email = shareType === "user" ? document.getElementById("shareEmail").value.trim() : "";
            const role = document.getElementById("shareRole").value;
            const shareMessage = document.getElementById("shareMessage");

            shareMessage.style.display = "none";
            shareMessage.innerText = "";
            shareMessage.classList.remove("success", "error");

            //Validate email if in "Specific User" mode
            if (shareType === "user") {
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!email || !emailPattern.test(email)) {
                    shareMessage.classList.add("error");
                    shareMessage.innerText = "Please enter an email address.";
                    shareMessage.style.display = "block";
                    return;
                }
            }

            try {
                const response = await fetch('/shareFile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fileId, email, role, shareType })
                });
                const result = await response.json();
                if (!response.ok) {
                    shareMessage.classList.add("error");
                    shareMessage.innerText = "Error sharing file: " + result.message;
                    shareMessage.style.display = "block";
                    return;
                }
                if (result.success) {
                    if (shareType === "anyone" && result.publicUrl) {
                        shareMessage.classList.add("success");
                        shareMessage.innerHTML = `
                            File shared publicly!<br>
                            <div class="copy-container">
                            <input type="text" id="publicUrlField" value="${result.publicUrl}" readonly class="copy-input">
                            <button id="copyUrlButton" class="copy-button">Copy</button>
                            </div>
                        `;
                        shareMessage.style.display = "block";
                        document.getElementById("copyUrlButton").addEventListener("click", () => {
                            const inputField = document.getElementById("publicUrlField");
                            inputField.select();
                            inputField.setSelectionRange(0, 99999); // for mobile devices
                            document.execCommand("copy");
                            const copyBtn = document.getElementById("copyUrlButton");
                            copyBtn.innerText = "Copied";
                            setTimeout(() => {
                                copyBtn.innerText = "Copy";
                            }, 2000);
                        })
                    } else {
                        shareMessage.classList.add("success");
                        shareMessage.innerText = "File shared successfully!";
                        shareMessage.style.display = "block";
                        //Close the modal after a delay of 2 seconds.
                        setTimeout(closeShareModal, 2000);
                    }
                } else {
                  shareMessage.classList.add("error");
                  shareMessage.innerText = "Error sharing file: " + result.message;
                  shareMessage.style.display = "block";
                }
            } catch (error) {
                console.error("Error sharing file:", error);
                shareMessage.classList.add("error");
                shareMessage.innerText = "An error occurred while sharing the file.";
                shareMessage.style.display = "block";
            }
             
            // closeShareModal();
        })

        console.log('Event listeners set up successfully');
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }

    // Global click event listener
    document.addEventListener('click', function(event) {
        const profileDropdown = document.getElementById('profileDropdown');
        const uploadMenu = document.getElementById('uploadMenu');

        if (!event.target.closest('.profile-section') && profileDropdown) {
            profileDropdown.style.display = 'none';
        }
        if (!event.target.closest('.upload-dropup') && uploadMenu) {
            uploadMenu.classList.remove('show');
        }
    });
}



function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
}

function showUploadModal() {
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) uploadModal.style.display = 'block';
}

function showEncryptedUploadModal() {
    const modal = document.getElementById('encryptedUploadModal');
    if (modal) modal.style.display = 'block';
}

function hideEncryptedUploadModal() {
    const modal = document.getElementById('encryptedUploadModal');
    if (modal) modal.style.display = 'none';
}

function hideUploadModal() {
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) uploadModal.style.display = 'none';
}

async function fetchDriveFiles(filter = 'all', folderId = null, token = null) {
    const fileListElement = document.getElementById('fileList');
    try {
        currentFilter = filter;
        let url = `/listFiles?filter=${filter}`;
        if (folderId) {
            url += `&folderId=${folderId}`;
        }
        if (token) {
            url += `&pageToken=${token}`;
        }
        isLoading = true;
        updateLoadingStatus();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        nextPageToken = data.nextPageToken;
        currentFolderId = folderId;
        displayFiles(data.files, filter === 'secure', token !== null);
        updateBreadcrumb();
    } catch (error) {
        console.error('Error fetching files:', error);
        showAlert('Failed to load files. Please try again later.', 'error');
        fileListElement.innerHTML = '<p>Failed to load files.</p>';
    } finally {
        isLoading = false;
        updateLoadingStatus();
    }
}

// function displayFiles(files, secureOnly = false) {
//     const fileListElement = document.getElementById('fileList');
//     fileListElement.innerHTML = '';

//     const filesToDisplay = secureOnly ? files.filter(file => file.properties && file.properties.encrypted === 'true') : files;

//     if (filesToDisplay.length === 0) {
//         fileListElement.innerHTML = '<p>No files found.</p>';
//         return;
//     }

//     filesToDisplay.forEach(file => {
//         const fileElement = document.createElement('div');
//         fileElement.classList.add('file-item');
//         const iconPath = getFileIconPath(file.mimeType, file.name);
        
//         const formattedSize = formatFileSize(file.size);
//         const formattedDate = formatDate(file.modifiedTime);
//         const isEncrypted = file.properties && file.properties.encrypted === 'true';

//         fileElement.innerHTML = `
//             <div class="file-item-content">
//                 <img src="${iconPath}" alt="${file.name}" class="file-icon" width="40" height="40">
//                 <div class="file-item-info">
//                     <a href="${file.webViewLink}" target="_blank" class="file-link">${file.name}</a>
//                     <div class="file-details">
//                         <span>${file.owners ? file.owners[0].displayName : 'Unknown'}</span>
//                         <span>${formattedDate}</span>
//                         <span>${formattedSize}</span>
//                         ${isEncrypted ? '<span class="encrypted-tag">Encrypted</span>' : ''}
//                     </div>
//                 </div>
//             </div>
//             <div class="file-actions">
//                 <button class="file-action-button share-btn" data-file-id="${file.id}">
//                     <i class="fas fa-share"></i>
//                 </button>
//                 <button class="file-action-button download-btn" data-file-id="${file.id}" data-file-name="${file.name}" data-encrypted="${isEncrypted}">
//                     <i class="fas fa-download"></i>
//                 </button>
//                 <button class="file-action-button delete-btn" data-file-id="${file.id}" data-file-name="${file.name}">
//                     <i class="fas fa-trash"></i>
//                 </button>
//             </div>
//         `;
//         fileListElement.appendChild(fileElement);
//     });

//     // Add event listeners for file actions
//     document.querySelectorAll('.share-btn').forEach(button => {
//         button.addEventListener('click', handleShare);
//     });
//     document.querySelectorAll('.download-btn').forEach(button => {
//         button.addEventListener('click', handleDownload);
//     });
//     document.querySelectorAll('.delete-btn').forEach(button => {
//         button.addEventListener('click', handleDelete);
//     });
// }

function displayFiles(files, secureOnly = false, append = false) {
    const fileListElement = document.getElementById('fileList');
    const loadingStatusElement = document.getElementById('loadingStatus');
    if (!append) {
        fileListElement.innerHTML = '';
    }

    const filesToDisplay = secureOnly ? files.filter(file => file.properties && file.properties.encrypted === 'true') : files;

    if (filesToDisplay.length === 0 && !append) {
        fileListElement.innerHTML = '<p>No files found.</p>';
        return;
    }

    filesToDisplay.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.classList.add('file-item');
        const iconPath = getFileIconPath(file.mimeType, file.name);
        const formattedSize = formatFileSize(file.size);
        const formattedDate = formatDate(file.modifiedTime);
        const isEncrypted = file.properties && file.properties.encrypted === 'true';

        fileElement.innerHTML = `
            <div class="file-item-content">
                <img src="${iconPath}" alt="${file.name}" class="file-icon" width="40" height="40">
                <div class="file-item-info">
                    <span class="file-link">${file.name}</span>
                    <div class="file-details">
                        <span>${file.owners ? file.owners[0].displayName : 'Unknown'}</span>
                        <span>${formattedDate}</span>
                        <span>${formattedSize}</span>
                        ${isEncrypted ? `<span class="encrypted-tag">Encrypted (${file.properties.encryptionAlgorithm || "Unknown"})</span>` : ""}
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="file-action-button share-btn" data-file-id="${file.id}">
                    <i class="fas fa-share"></i>
                </button>
                <button class="file-action-button download-btn" data-file-id="${file.id}" data-file-name="${file.name}" data-encrypted="${isEncrypted}">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action-button delete-btn" data-file-id="${file.id}" data-file-name="${file.name}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        // If this file is a folder, make it clickable to navigate into it.
        if (file.mimeType === "application/vnd.google-apps.folder") {
            fileElement.style.cursor = "pointer";
            fileElement.addEventListener('click', () => {
            fetchDriveFiles('all', file.id); // Load the contents of this folder
            });
        } else {
            const fileLink = fileElement.querySelector('.file-link');
            fileLink.style.cursor = "pointer";
            fileLink.addEventListener('click', (e) => {
                e.preventDefault();
                previewFile(file);
            })
        }
        fileListElement.appendChild(fileElement);
    });

    let sentinel = document.getElementById('scrollSentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'scrollSentinel';
        fileListElement.appendChild(sentinel);
        observeSentinel(sentinel);
    }

    // Add event listeners for file actions
    // document.querySelectorAll('.share-btn').forEach(button => {
    //     button.addEventListener('click', handleShare);
    // });
    document.querySelectorAll('.share-btn').forEach(button => {
        button.addEventListener('click', function(e) {
          e.stopPropagation();
          const fileId = this.getAttribute("data-file-id");
          openShareModal(fileId);
        });
    });
    document.querySelectorAll('.download-btn').forEach(button => {
        button.addEventListener('click', handleDownload);
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
}

function filterFiles(searchTerm) {
    const fileItems = document.querySelectorAll('.file-item');
    fileItems.forEach(item => {
        const fileName = item.querySelector('.file-link').textContent.toLowerCase();
        if (fileName.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}


function handleFileUpload(event, isEncrypted = false) {
    event.preventDefault();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.onchange = function () {
      const file = fileInput.files[0];
      if (file) {
        uploadFile(file, isEncrypted);
      }
    };
    fileInput.click();
  }

  async function handleEncryptedFileUpload(event) {
    event.preventDefault();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.onchange = async function () {
      const file = fileInput.files[0];
      if (file) {
        try {
          showProgressBar();
          await uploadFile(file, true);
        } catch (error) {
          console.error('Encryption error:', error);
          showAlert('Failed to upload encrypted file. Please try again.', 'error');
          hideProgressBar();
        }
      }
    };
    fileInput.click();
  }

function handleFolderUpload(event) {
    event.preventDefault();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.webkitdirectory = true;
    fileInput.onchange = function () {
        if (fileInput.files.length > 0) {
            const formData = new FormData();
            const folderPath = fileInput.files[0].webkitRelativePath.split('/')[0];
            formData.append('folderName', folderPath);
            for (const file of fileInput.files) {
                formData.append('files', file);
            }
            uploadFolderToServer(formData, fileInput.files.length);
        }
    };
    fileInput.click();
}

async function uploadFile(file, isEncrypted = false) {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("isEncrypted", isEncrypted.toString())
  
    // Get the current encryption algorithm from the settings
    const encryptionAlgoSelect = document.getElementById("encryptionAlgorithm")
    const currentAlgorithm = encryptionAlgoSelect ? encryptionAlgoSelect.value : "balanced"
  
    formData.append(
      "metadata",
      JSON.stringify({
        properties: {
          encrypted: isEncrypted,
          originalMimeType: file.type,
          encryptionAlgorithm: isEncrypted ? currentAlgorithm : "none",
        },
      }),
    )
  
    try {
      showProgressBar()
      const response = await fetch("/uploadFile", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
  
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
      }
  
      const result = await response.json()
      hideProgressBar()
      showAlert(`${isEncrypted ? "Encrypted f" : "F"}ile uploaded successfully`, "success")
      fetchDriveFiles()
      updateEncryptedFilesCount()
    } catch (error) {
      hideProgressBar()
      console.error("Upload error:", error)
      showAlert(`Failed to upload ${isEncrypted ? "encrypted " : ""}file. ${error.message}`, "error")
    }
  }

  function showProgressBar() {
    const progressContainer = document.getElementById('uploadProgressContainer');
    if (progressContainer) progressContainer.style.display = 'block';
  }

function hideProgressBar() {
    const progressContainer = document.getElementById('uploadProgressContainer');
    if (progressContainer) {
      progressContainer.style.display = 'none';
      updateProgressBar(0);
    }
  }

  function updateProgressBar(percent) {
    const progressBar = document.getElementById('uploadProgressBar');
    if (progressBar) progressBar.style.width = percent + '%';
  }  

function uploadFolderToServer(formData, totalFiles) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/uploadFolder', true);

    showProgressBar();

    xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            updateProgressBar(percentComplete);
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            hideProgressBar();
            showAlert('Folder uploaded successfully', 'success');
            fetchDriveFiles(); // Refresh file list
        } else {
            hideProgressBar();
            showAlert('Failed to upload folder. Please try again.', 'error');
        }
    };

    xhr.onerror = function() {
        hideProgressBar();
        showAlert('An error occurred while uploading the folder.', 'error');
    };

    xhr.send(formData);
}

function toggleGoogleDriveSection() {
    document.querySelector('.content-header h2').textContent = "My Drive";
    document.querySelector('.dashboard-cards').style.display = 'none';
    document.getElementById('fileSection').style.display = 'block';
    fetchDriveFiles();
}

async function fetchUserProfile() {
    try {
        const response = await fetch('/api/userProfile');
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        const profileData = await response.json();
        updateProfileInfo(profileData);
        updateTotalStorageCard(profileData);
        return profileData;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        showAlert("Failed to load user profile. Please try to re-login.", 'error');
        throw error;
    }
}

function updateProfileUI(profileData) {
    const defaultProfileImage = 'assets/default-profile-icon.png';
    const profilePicture = profileData.profilePicture || defaultProfileImage;

    document.getElementById('profileIconImage').src = profilePicture;
    document.getElementById('profilePicture').src = profilePicture;
    document.getElementById('profileName').textContent = profileData.name;
    document.getElementById('profileEmail').textContent = profileData.email;
    document.getElementById('profileStorage').textContent = `${formatBytes(profileData.storageUsed)} / ${formatBytes(profileData.storageLimit)} used`;

    const recentFilesList = document.getElementById('recentFilesList');
    recentFilesList.innerHTML = '';
    profileData.recentFiles.slice(0, 5).forEach(file => {
        const li = document.createElement('li');
        li.className = 'recent-file-item';
        const iconClass = getFileIconClass(file.type);
        li.innerHTML = `
            <i class="${iconClass}"></i>
            <span class="file-name">${file.name}</span>
            <span class="file-date">${formatDate(file.lastModified)}</span>
        `;
        recentFilesList.appendChild(li);
    });
}

function showProfileModal() {
    const profileModal = document.getElementById('profileModal');
    if (profileModal) profileModal.style.display = 'block';
}

function hideProfileModal() {
    const profileModal = document.getElementById('profileModal');
    if (profileModal) profileModal.style.display = 'none';
}


function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatFileSize(bytes) {
    if (bytes === undefined) return 'Unknown';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
  
    if (diffDays === 0) {
      if (diffHours === 0) {
        if (diffMinutes === 0) {
          return 'Just now';
        }
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
      }
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

function setupProfileIcon() {
    const profileIconImage = document.getElementById('profileIconImage');
    const profilePicture = document.getElementById('profilePicture');
    const defaultProfileImage = 'assets/default-profile-icon.png';

    function setDefaultImage(imgElement) {
        imgElement.src = defaultProfileImage;
    }

    profileIconImage.onerror = function() {
        setDefaultImage(this);
    };

    profilePicture.onerror = function() {
        setDefaultImage(this);
    };

    // Set default image if src is empty or invalid
    if (!profileIconImage.src || profileIconImage.src === window.location.href) {
        setDefaultImage(profileIconImage);
    }

    if (!profilePicture.src || profilePicture.src === window.location.href) {
        setDefaultImage(profilePicture);
    }
}

async function handleSignOut() {
    try {
        const response = await fetch('/api/signout', {
            method: 'POST',
            credentials: 'include',
        });

        if (response.ok) {
            // Clear any client-side storage
            hideLoadingOverlay();
            localStorage.removeItem('user');
            sessionStorage.removeItem('dashboardLoaded');
            sessionStorage.clear();

            // Redirect to the login page
            window.location.href = '/';
        } else {
            const errorData = await response.json();
            console.error('Sign out failed:', errorData.error);
            alert('Failed to sign out. Please try again.');
        }
    } catch (error) {
        console.error('Error during sign out:', error);
        alert('An error occurred while signing out. Please try again.');
    }
}

function getFileIconClass(mimeType) {
    const iconMap = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fas fa-file-word',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fas fa-file-excel',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'fas fa-file-powerpoint',
        'application/pdf': 'fas fa-file-pdf',
        'text/plain': 'fas fa-file-alt',
        'image/jpeg': 'fas fa-file-image',
        'image/png': 'fas fa-file-image',
        'audio/mpeg': 'fas fa-file-audio',
        'video/mp4': 'fas fa-file-video',
    };

    return iconMap[mimeType] || 'fas fa-file';
}

function updateTotalStorageCard(profileData) {
    const totalStorageValue = document.getElementById('totalStorageValue');
    const totalStorageSubtext = document.getElementById('totalStorageSubtext');
    
    if (!totalStorageValue || !totalStorageSubtext) {
        console.error('Total storage elements not found');
        return;
    }
    
    const usedStorage = formatBytes(profileData.storageUsed);
    const totalStorage = formatBytes(profileData.storageLimit);
    const freeStorage = formatBytes(profileData.storageLimit - profileData.storageUsed);
    
    totalStorageValue.textContent = `${usedStorage} / ${totalStorage}`;
    totalStorageSubtext.textContent = `${freeStorage} free`;

    // Update the progress bar
    updateStorageProgressBar(profileData.storageUsed, profileData.storageLimit);
}

function updateStorageProgressBar(used, total) {
    const progressBar = document.querySelector('.total-storage .progress-bar');
    if (!progressBar) {
        console.error('Progress bar element not found');
        return;
    }

    const percentage = (used / total) * 100;
    progressBar.style.width = `${percentage}%`;

    // Change color based on usage
    if (percentage > 90) {
        progressBar.style.backgroundColor = '#ff4444'; // Red for high usage
    } else if (percentage > 70) {
        progressBar.style.backgroundColor = '#ffbb33'; // Orange for moderate usage
    } else {
        progressBar.style.backgroundColor = '#00C851'; // Green for low usage
    }
}

function checkAuthentication() {
    fetch('/api/checkAuth', { credentials: 'include' })
      .then(response => {
        if (!response.ok) {
          console.error('Failed to fetch /api/checkAuth:', response.status, response.statusText);
          throw new Error('Authentication check failed');
        }
        return response.json();
      })
      .then(data => {
        if (data.authenticated) {
          // Check if the current page is already the dashboard to prevent an infinite loop
          if (window.location.pathname === '/dashboard.html') {
            console.log('User is already on the dashboard, no further redirects needed.');
            return; // Exit to prevent continuous reloading
          }
          updateLoginMessage('Already authenticated. Redirecting to dashboard...');
          setTimeout(() => {
            window.location.href = '/dashboard.html'; // Redirect only if not already on the dashboard
          }, 1000);
        } else {
          updateLoginMessage('Please log in.');
        }
      })
      .catch(error => {
        console.error('Error checking authentication:', error);
        updateLoginMessage('Unable to check authentication status. Please try again.', true);
      });
  }
  
let authCheckInterval;

function setupPeriodicAuthCheck() {
    // Clear any existing interval
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
    }

    authCheckInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/checkAuth', {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            
            // If it's a network error, don't redirect immediately
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                console.log('Network error detected. Will retry on next interval.');
            } else {
                // For other errors, redirect to login
                window.location.href = '/login.html';
            }
        }
    }, 60000); // Check every minute
}

function handleVisibilityChange() {
    if (document.hidden) {
        // Page is hidden, clear the interval
        if (authCheckInterval) {
            clearInterval(authCheckInterval);
        }
    } else {
        // Page is visible again, restart the periodic check
        setupPeriodicAuthCheck();
    }
}

function initializeAuthCheck() {
    setupPeriodicAuthCheck();
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

function updateLoginMessage(message, isError = false) {
    const loginMessage = document.getElementById('loginMessage'); // Ensure this element exists in your HTML
    if (!loginMessage) {
        console.error('Login message element not found');
        return;
    }
    loginMessage.textContent = message;
    loginMessage.style.color = isError ? 'red' : 'blue';
}

function getFileIconPath(mimeType, fileName) {
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    const iconMap = {
      'folder': 'folder.png',
      'audio': 'audio.png',
      'video': 'video.png',
      'image': 'image.png',
      'pdf': 'pdf.png',
      'zip': 'zip.png',
      'rar': 'rar.png',
      '7z': 'zip.png',
      'tar': 'zip.png',
      'gz': 'zip.png',
      'doc': 'docx.png',
      'docx': 'docx.png',
      'odt': 'docx.png',
      'xls': 'xls.png',
      'xlsx': 'xls.png',
      'csv': 'xls.png',
      'ppt': 'pptx.png',
      'pptx': 'pptx.png',
      'py': 'py.svg',
      'js': 'js.svg',
      'java': 'java.svg',
      'exe': 'exe.png',
      'sh': 'sh.svg',
      'cpp': 'cpp.svg',
      'cs': 'cs.svg',
      'php': 'php.png',
      'rb': 'rb.svg',
      'swift': 'swift.svg',
      'go': 'go.svg',
      'ts': 'ts.svg',
      'html': 'html.svg',
      'css': 'css.svg',
      'sql': 'sql.png',
      'txt': 'txt.png',
      'svg': 'svg.png',
      'apk': 'apk.png',
      'iso': 'iso.png',
      'jsx': 'jsx.svg',
      'unknown': 'unknown.png'
    };
  
    let iconName;
  
    if (mimeType === 'application/vnd.google-apps.folder') {
      iconName = 'folder';
    } else if (mimeType.startsWith('audio/')) {
      iconName = 'audio';
    } else if (mimeType.startsWith('video/')) {
      iconName = 'video';
    } else if (mimeType.startsWith('image/')) {
      iconName = 'image';
    } else if (mimeType === 'application/pdf') {
      iconName = 'pdf';
    } else if (fileExtension in iconMap) {
      iconName = fileExtension;
    } else if (mimeType === 'application/vnd.google-apps.document') {
      iconName = 'docx';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      iconName = 'xlsx';
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      iconName = 'pptx';
    } else {
      iconName = 'unknown';
    }
  
    return `/assets/file-icons/${iconMap[iconName]}`;
  }

  function toggleView() {
    const fileListElement = document.getElementById('fileList');
    const toggleViewIcon = document.getElementById('toggleViewIcon');
    const isGrid = fileListElement.classList.toggle('file-grid');

    if (isGrid) {
        toggleViewIcon.src = 'assets/file-icons/list-icon.png';
        fileListElement.classList.remove('file-list');
    } else {
        toggleViewIcon.src = 'assets/file-icons/grid-icon.png';
        fileListElement.classList.add('file-list');
    }

    // Re-display files to apply the new layout
    fetchDriveFiles();
}


function setupProfileDropdown() {
    const profileToggle = document.getElementById('profileToggle');
    const profileDropdown = document.getElementById('profileDropdown');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const settingsButton = document.getElementById('settingsButton');
    const signOutButton = document.getElementById('signOutButton');

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }

    profileToggle.addEventListener('click', function(event) {
        event.stopPropagation();
        toggleProfileDropdown();
    });

    document.addEventListener('click', function(event) {
        if (!profileDropdown.contains(event.target) && event.target !== profileToggle) {
            profileDropdown.style.display = 'none';
        }
    });

    darkModeToggle.addEventListener('click', toggleDarkMode);
    settingsButton.addEventListener('click', openSettings);
    signOutButton.addEventListener('click', handleSignOut);
}

function toggleDarkMode() {
    const body = document.body;
    const isDarkMode = body.classList.toggle('dark-mode');
    updateDarkModeStyles(isDarkMode);
    localStorage.setItem('darkMode', isDarkMode);
}

function updateDarkModeStyles(isDarkMode) {
    const darkModeStylesheet = document.getElementById('darkModeStylesheet');
    if (isDarkMode) {
        if (!darkModeStylesheet) {
            const link = document.createElement('link');
            link.id = 'darkModeStylesheet';
            link.rel = 'stylesheet';
            link.href = 'styles/dark-mode.css';
            document.head.appendChild(link);
        }
    } else {
        if (darkModeStylesheet) {
            darkModeStylesheet.remove();
        }
    }

    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.innerHTML = isDarkMode ? 
            '<i class="fas fa-sun"></i> Light Mode' : 
            '<i class="fas fa-moon"></i> Dark Mode';
    }
}

function applyTheme(theme) {
  // Remove any existing theme stylesheet
  const existingLink = document.getElementById('theme-stylesheet');
  if (existingLink) {
    existingLink.remove();
  }
  
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    const link = document.createElement('link');
    link.id = 'theme-stylesheet';
    link.rel = 'stylesheet';
    link.href = 'styles/dark-mode.css';
    document.head.appendChild(link);
  } else if (theme === 'light') {
    document.body.classList.remove('dark-mode');
  } else if (theme === 'system') {
    // Use system preference
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (systemPrefersDark) {
      document.body.classList.add('dark-mode');
      const link = document.createElement('link');
      link.id = 'theme-stylesheet';
      link.rel = 'stylesheet';
      link.href = 'styles/dark-mode.css';
      document.head.appendChild(link);
    } else {
      document.body.classList.remove('dark-mode');
    }
  }
  // Save the preference in localStorage
  localStorage.setItem('theme', theme);
}

function setInitialTheme() {
  const storedTheme = localStorage.getItem('theme') || 'system';
  const themeSelect = document.querySelector('.theme-select');
  if (themeSelect) {
    themeSelect.value = storedTheme;
  }
  applyTheme(storedTheme);
}

document.addEventListener('DOMContentLoaded', function() {
  setInitialTheme();

  // Listen for changes in the theme select dropdown
  const themeSelect = document.querySelector('.theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const selectedTheme = e.target.value;
      console.log(`Theme changed to: ${selectedTheme}`);
      applyTheme(selectedTheme);
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  setInitialTheme();

  // Listen for changes in the theme select dropdown
  const themeSelect = document.querySelector('.theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const selectedTheme = e.target.value;
      console.log(`Theme changed to: ${selectedTheme}`);
      applyTheme(selectedTheme);
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  // Privacy Policy Toggle Logic
  const shortPolicyBtn = document.getElementById('shortPolicyBtn');
  const fullPolicyBtn = document.getElementById('fullPolicyBtn');
  const policyContainer = document.getElementById('privacyPolicyContainer');

  // Short version of the privacy policy
  const shortPolicy = `
    <p><strong>Avaran Privacy Policy (Short Version)</strong></p>
    <p>Avaran is a secure client‑side encryption tool that protects your files before they are uploaded to your cloud storage provider. All encryption and file processing occur locally on your device. We do not collect or store your personal data—only encrypted files are transmitted.</p>
    <p>For full details, please view the full policy.</p>
  `;

  // Full version of the privacy policy
  const fullPolicy = `
    <p><strong>Privacy Policy for Avaran</strong></p>
  <p>Last updated March 19, 2025</p>
  <p>This Privacy Notice for Avaran ("we," "us," or "our") describes how and why we might access, collect, store, use, and/or share ("process") your personal information when you use our Services. By using Avaran, you agree to the practices described in this notice. If you do not agree with our policies, please do not use our Services.</p>
  
  <h4>1. WHAT INFORMATION DO WE COLLECT?</h4>
  <p><strong>Personal Information You Provide:</strong> Avaran does not collect or store personal data on our servers. When you register or use the app, any data you provide (such as your email for account creation) is used solely for account management and remains on your device.</p>
  
  <h4>2. HOW DO WE PROCESS YOUR INFORMATION?</h4>
  <p>Avaran is a secure, client‑side encryption tool. All encryption and decryption operations occur locally on your device. When you upload files, you have the option to send them in an encrypted form. However, if you choose to upload normal (unencrypted) files, they are still transmitted securely via HTTPS to your cloud drive provier. In either case, no unencrypted personal data is stored on our servers.</p>
  
  <h4>3. LEGAL BASES</h4>
  <p>Because all processing occurs locally on your device and no personal data is stored on our servers, our operations are based solely on your explicit consent to use the app's functionality.</p>
  
  <h4>4. WHEN AND WITH WHOM DO WE SHARE YOUR INFORMATION?</h4>
  <p>We do not share any of your personal data with third parties. All file processing is done locally, and only encrypted files are sent directly to your cloud drive provider.</p>
  
  <h4>5. HOW DO WE KEEP YOUR INFORMATION SAFE?</h4>
  <p>We use industry‑standard encryption and robust key management techniques to secure your files. Specifically, files are encrypted with a Data Encryption Key (DEK), which is then protected by a Key Encryption Key (KEK) derived from your password. This layered approach ensures that even if your password is changed, your previously encrypted files remain accessible via the updated KEK.</p>
  
  <h4>6. YOUR PRIVACY RIGHTS</h4>
  <p>Since Avaran operates entirely on your device, you retain full control over your data. You may update or delete your data at any time, and no personal information is transmitted or stored externally.</p>
  
  <h4>7. CHANGES TO THIS NOTICE</h4>
  <p>We may update this Privacy Notice from time to time. The updated version will be posted within Avaran and become effective immediately. We encourage you to review this notice periodically.</p>
  
  <h4>8. HOW CAN YOU CONTACT US?</h4>
  <p>If you have any questions or concerns about this Privacy Notice, please contact us at <a id="privacyPolicymail" href="mailto:team26capstonevit@gmail.com">team26capstonevit@gmail.com</a>.</p>
  `;

  // Initially load the short version
  policyContainer.innerHTML = shortPolicy;

  function setActivePolicy(activeBtn) {
    [shortPolicyBtn, fullPolicyBtn].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }
  shortPolicyBtn.addEventListener('click', () => {
    policyContainer.innerHTML = shortPolicy;
    setActivePolicy(shortPolicyBtn);
  });

  fullPolicyBtn.addEventListener('click', () => {
    policyContainer.innerHTML = fullPolicy;
    setActivePolicy(fullPolicyBtn);
  });

});


function openSettings() {
    // Implement your settings functionality here
    console.log('Settings clicked');
}

function updateProfileInfo(profileData) {
    const elements = {
        profileName: document.getElementById('profileName'),
        profileEmail: document.getElementById('profileEmail'),
        profilePicture: document.getElementById('profilePicture'),
        profileIconImage: document.getElementById('profileIconImage')
    };

    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`${key} element not found`);
            continue;
        }

        if (key === 'profilePicture' || key === 'profileIconImage') {
            element.src = profileData.profilePicture || 'assets/default-profile-icon.png';
        } else {
            element.textContent = profileData[key.replace('profile', '').toLowerCase()] || '';
        }
    }
}

function handleDelete(event) {
    event.stopPropagation();
    const fileId = event.currentTarget.dataset.fileId;
    const fileName = event.currentTarget.dataset.fileName;
    if (fileId && fileName) {
        showDeleteModal(fileId, fileName);
    } else {
        console.error('File ID or name is missing');
        showAlert('Error: Unable to delete file. Please try again.', 'error');
    }
}

async function deleteFile(fileId) {
    try {
        const response = await fetch(`/deleteFile/${fileId}`, { method: 'DELETE' });
        if (response.ok) {
            showAlert('File deleted successfully', 'success');
            fetchDriveFiles(); // Refresh the file list
            updateEncryptedFilesCount();
        } else {
            const errorData = await response.json();
            showAlert('Failed to delete file', 'error')
            console.log(`Failed to delete file: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        showAlert('An error occurred while deleting the file', 'error');
    }
}

function toggleUploadMenu() {
    const uploadMenu = document.getElementById('uploadMenu');
    if (uploadMenu) {
        uploadMenu.classList.toggle('show');
    }
}

  function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        console.error('Alert container not found');
        return;
    }

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    
    const icon = document.createElement('span');
    icon.className = 'alert-icon';
    icon.innerHTML = getAlertIcon(type);
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'alert-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => {
        alert.remove();
    };
    
    alert.appendChild(icon);
    alert.appendChild(messageSpan);
    alert.appendChild(closeButton);
    
    alertContainer.appendChild(alert);
    
    // Force a reflow to enable the transition
    alert.offsetHeight;
    
    alert.classList.add('show');
    
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => {
            alert.remove();
        }, 300);
    }, 5000);
}

function getAlertIcon(type) {
    switch (type) {
        case 'error':
            return '<i class="fas fa-exclamation-circle"></i>';
        case 'success':
            return '<i class="fas fa-check-circle"></i>';
        case 'info':
        default:
            return '<i class="fas fa-info-circle"></i>';
    }
}

function removeAlert(alert) {
    alert.classList.remove('show');
    setTimeout(() => {
        alert.remove();
    }, 300);
}

function showDeleteModal(fileId, fileName) {
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.style.display = 'block';
    deleteModal.dataset.fileId = fileId;
    
    const modalMessage = deleteModal.querySelector('p');
    modalMessage.textContent = `Are you sure you want to delete "${fileName}"? This action cannot be undone.`;
}

function hideDeleteModal() {
    deleteModal.style.display = 'none';
}

document.querySelectorAll('.file-action-button.delete-btn').forEach(button => {
    const fileId = button.closest('.file-item').dataset.fileId;
    const fileName = button.closest('.file-item').querySelector('.file-link').textContent;
    button.addEventListener('click', (event) => handleDelete(event, fileId, fileName));
});

function handleUploadFormSubmit(event) {
    event.preventDefault();
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length > 0) {
        uploadFile(fileInput.files[0]);
    }
}

async function uploadEncryptedFile(file) {
    const formData = new FormData();
    
    // Read the file as an ArrayBuffer
    const fileArrayBuffer = await file.arrayBuffer();
    
    // Append the file to the formData
    formData.append('file', new Blob([fileArrayBuffer]), file.name);
    
    // Add metadata to indicate encryption and original mime type
    formData.append('metadata', JSON.stringify({
        properties: {
            encrypted: 'true',
            originalMimeType: file.type
        }
    }));
    formData.append('isEncrypted', 'true');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/uploadFile', true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            updateProgressBar(percentComplete);
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            showAlert('Encrypted file uploaded successfully', 'success');
            fetchDriveFiles(); // Refresh file list
        } else {
            showAlert('Failed to upload encrypted file. Please try again.', 'error');
        }
        hideProgressBar();
    };

    xhr.onerror = function() {
        showAlert('An error occurred while uploading the encrypted file.', 'error');
        hideProgressBar();
    };

    showProgressBar();
    xhr.send(formData);
}

function showSecureFiles() {
    setActiveSidebarItem('secureFilesLink');
    // const sectionTitle = document.getElementById('sectionTitle');
    const statisticsSection = document.getElementById('statisticsSection');
    const fileSection = document.getElementById('fileSection');

    if (statisticsSection) statisticsSection.style.display = 'none';
    if (fileSection) {
        fileSection.style.display = 'block';
    }

    fetchDriveFiles('secure');
}

function checkRequiredElements() {
    const requiredElements = [
        'dashboardCards',
        'fileSection',
        'fileList',
        'uploadProgressContainer',
        'uploadProgressBar'
    ];

    const missingElements = requiredElements.filter(id => !document.getElementById(id));

    if (missingElements.length > 0) {
        console.error('Missing required elements:', missingElements.join(', '));
        showAlert('Some page elements are missing. Please refresh the page or contact support.', 'error');
    }
}

async function handleDownload(event) {
    const fileId = event.currentTarget.dataset.fileId
    const fileName = event.currentTarget.dataset.fileName
    const isEncrypted = event.currentTarget.dataset.encrypted === "true"
  
    try {
      console.log(`Attempting to download file: ${fileName} (ID: ${fileId}, Encrypted: ${isEncrypted})`)
  
      const url = `/api/downloadFile/${fileId}`
  
      const response = await fetch(url)
  
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Download failed")
      }
  
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = downloadUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)
  
      console.log(`File downloaded successfully: ${fileName}`)
      showAlert(isEncrypted ? "Encrypted file downloaded successfully" : "File downloaded successfully", "success")
    } catch (error) {
      console.error("Error downloading file:", error)
      showAlert(`Failed to download file: ${error.message}`, "error")
    }
  }

function convertWordArrayToUint8Array(wordArray) {
    const arrayOfWords = wordArray.words;
    const length = wordArray.sigBytes;
    const uInt8Array = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        const byte = (arrayOfWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        uInt8Array[i] = byte;
    }
    return uInt8Array;
}

async function updateEncryptedFilesCount() {
    try {
        const response = await fetch('/listFiles?filter=secure');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const files = data.files || []
        const encryptedFiles = files.filter(file => file.properties && file.properties.encrypted === 'true');
        const encryptedFilesCount = encryptedFiles.length;
        
        const countElement = document.getElementById('encryptedFilesCount');
        if (countElement) {
            countElement.textContent = encryptedFilesCount;
        }
    } catch (error) {
        console.error('Error fetching encrypted files count:', error);
    }
}

// function setActiveSidebarItem(itemId) {
//     // Remove 'active' class from all sidebar items
//     document.querySelectorAll('.nav-links ul li a').forEach(item => {
//         item.classList.remove('active');
//     });

//     // Add 'active' class to the selected item
//     const activeItem = document.getElementById(itemId);
//     if (activeItem) {
//         activeItem.classList.add('active');
//     }
// }

function setActiveSidebarItem(itemId) {
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
      link.classList.remove('active');
    });
    const activeLink = document.getElementById(itemId);
    if (activeLink) {
      activeLink.classList.add('active');
    }
}

/*settingss*/

document.addEventListener('DOMContentLoaded', function() {
    const settingsModal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close-button');
    const navItems = document.querySelectorAll('.settings-nav .nav-item');
    const sections = document.querySelectorAll('.settings-section');

    // Show modal
    function showSettingsModal() {
        settingsModal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    // Hide modal
    function hideSettingsModal() {
        settingsModal.style.display = 'none';
        document.body.style.overflow = ''; // Restore background scrolling
    }

    // Switch sections
    function switchSection(sectionId) {
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.section === sectionId);
        });

        sections.forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
    }

    // Event Listeners
    settingsButton.addEventListener('click', showSettingsModal);
    closeButton.addEventListener('click', hideSettingsModal);

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(item.dataset.section);
        });
    });

    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            hideSettingsModal();
        }
    });

    // Handle theme change
    const themeSelect = document.querySelector('.theme-select');
    themeSelect.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        console.log(`Theme changed to: ${selectedTheme}`);
        // Implement theme change logic here
    });

    // Handle encryption algorithm change
    const encryptionAlgoSelect = document.getElementById("encryptionAlgorithm")
    if (encryptionAlgoSelect) {
      encryptionAlgoSelect.addEventListener("change", handleEncryptionAlgorithmChange)
    }

    // Handle files display count change
    const filesDisplayCountInput = document.getElementById('filesDisplayCount');
    filesDisplayCountInput.addEventListener('change', (e) => {
        const count = e.target.value;
        console.log(`Files display count changed to: ${count}`);
        // Implement files display count change logic here
    });

    // Handle premium upgrade
    const upgradeToPremiumButton = document.getElementById('upgradeToPremium');
    upgradeToPremiumButton.addEventListener('click', () => {
        console.log('Upgrade to premium clicked');
        // Implement premium upgrade logic here
    });

    // Handle privacy policy link
    // const privacyPolicyLink = document.getElementById('privacyPolicyLink');
    // privacyPolicyLink.addEventListener('click', (e) => {
    //     e.preventDefault();
    //     console.log('Privacy policy link clicked');
    //     // Implement privacy policy display logic here
    // });

    // For demonstration purposes, let's log when the modal is opened and closed
    console.log('Settings modal script loaded');
    settingsButton.addEventListener('click', () => console.log('Settings modal opened'));
    closeButton.addEventListener('click', () => console.log('Settings modal closed'));
});

const currentEncryptionAlgorithm = "balanced" // Default value

function handleEncryptionAlgorithmChange(event) {
  const selectedAlgorithm = event.target.value
  console.log(`Encryption algorithm changed to: ${selectedAlgorithm}`)

  // Update description based on selected algorithm
  const encryptionDescription = document.getElementById("encryptionDescription")
  switch (selectedAlgorithm) {
    case "fast":
      encryptionDescription.textContent = "Fast but less secure. Suitable for less sensitive data."
      break
    case "balanced":
      encryptionDescription.textContent = "Balanced approach between speed and security."
      break
    case "secure":
      encryptionDescription.textContent = "Most secure option but may be slower for large files."
      break
  }

  // Send the update to the server
  fetch("/api/updateEncryptionAlgorithm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ algorithm: selectedAlgorithm }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    })
    .then((data) => {
      if (data.message) {
        showAlert(data.message, "success")
      } else {
        throw new Error(data.error || "Failed to update encryption algorithm")
      }
    })
    .catch((error) => {
      console.error("Error updating encryption algorithm:", error)
      showAlert("Failed to update encryption algorithm. Please try again.", "error")
    })
}

async function encryptFile(data) {
    const encoder = new TextEncoder();
    const passwordInput = prompt("Enter encryption password:");
    if (!passwordInput) {
      throw new Error("Encryption cancelled");
    }
    const password = encoder.encode(passwordInput);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      "raw",
      password,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      derivedKey,
      data
    );
    return new Uint8Array([...salt, ...iv, ...new Uint8Array(encrypted)]);
  }

// Loading Overlay functions

function showLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = "flex"; // Use flex to match the CSS layout
        overlay.classList.add("show");   // Apply the 'show' class to set opacity to 1
        simulateLoading();
    }
}
  
function hideLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("show");  // Remove the 'show' class to trigger fade-out
        setTimeout(() => {
            overlay.style.display = "none";
        }, 300);
    }
}
  
function simulateLoading() {
    const progressBar = document.querySelector(".loading-progress-bar");
    const loadingText = document.querySelector(".loading-text");
    let progress = 0;
    
    // Clear any previous interval if needed (optional safeguard)
    if (window._loadingInterval) {
        clearInterval(window._loadingInterval);
    }
    
    window._loadingInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        progressBar.style.width = `${progress}%`;

        if (progress < 30) {
            loadingText.textContent = "Connecting to server...";
        } else if (progress < 60) {
            loadingText.textContent = "Fetching your files...";
        } else if (progress < 90) {
            loadingText.textContent = "Preparing your dashboard...";
        } else {
            loadingText.textContent = "Almost there!";
        }

        if (progress === 100) {
            clearInterval(window._loadingInterval);
            window._loadingInterval = null;
            setTimeout(hideLoadingOverlay, 500);
        }
    }, 200);
}

function updateBreadcrumb() {
    const breadcrumbContainer = document.getElementById('breadcrumb');
    breadcrumbContainer.innerHTML = ''; // Clear existing breadcrumbs
  
    // Show a back button if we're not at root
    if (currentFolderId) {
      const backButton = document.createElement('button');
      backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
      backButton.classList.add('breadcrumb-back');
      backButton.addEventListener('click', () => {
        // For simplicity, go back to root (or manage a navigation stack for multi-level)
        currentFolderId = null;
        fetchDriveFiles('all'); // Reload files from root
      });
      breadcrumbContainer.appendChild(backButton);
    }
}

function previewFile(file) {
    if (!file.id) {
      showAlert('No preview available for this file.', 'error');
      return;
    }
    
    const previewModal = document.getElementById('previewModal');
    const previewContent = previewModal.querySelector('.preview-modal-content');
    previewContent.innerHTML = ''; // Clear previous content
  
    // Create and insert spinner overlay
    const spinnerOverlay = document.createElement('div');
    spinnerOverlay.className = 'loading-spinner-overlay';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinnerOverlay.appendChild(spinner);
    previewContent.appendChild(spinnerOverlay);
    
    // Function to remove the spinner overlay
    function hideSpinner() {
      if (spinnerOverlay && spinnerOverlay.parentNode) {
        spinnerOverlay.parentNode.removeChild(spinnerOverlay);
      }
    }
    
    // If the file is encrypted, show a message.
    if (file.encrypted) {
      hideSpinner();
      const msg = document.createElement('p');
      msg.style.padding = '20px';
      msg.style.textAlign = 'center';
      msg.style.color = '#666';
      msg.textContent = 'Unable to preview encrypted file.';
      previewContent.appendChild(msg);
    }
    // For image files.
    else if (file.mimeType && file.mimeType.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = `/previewFile?fileId=${file.id}`;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      img.onload = hideSpinner;
      img.onerror = () => {
        hideSpinner();
        const errMsg = document.createElement('p');
        errMsg.textContent = 'Error loading image preview.';
        errMsg.style.padding = '20px';
        errMsg.style.textAlign = 'center';
        errMsg.style.color = '#666';
        previewContent.appendChild(errMsg);
      };
      previewContent.appendChild(img);
    }
    // For PDFs.
    else if (file.mimeType === 'application/pdf') {
      const iframe = document.createElement('iframe');
      iframe.src = `/previewFile?fileId=${file.id}`;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.onload = hideSpinner;
      previewContent.appendChild(iframe);
    }
    // For Office documents.
    else if (isOfficeFile(file.mimeType)) {
      if (file.webViewLink) {
        const iframe = document.createElement('iframe');
        iframe.src = file.webViewLink;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.onload = hideSpinner;
        previewContent.appendChild(iframe);
      } else {
        hideSpinner();
        const msg = document.createElement('p');
        msg.style.padding = '20px';
        msg.style.textAlign = 'center';
        msg.style.color = '#666';
        msg.textContent = 'Preview not available for this document.';
        previewContent.appendChild(msg);
      }
    }
    // For text-based files.
    else if (file.mimeType && isTextType(file.mimeType)) {
      fetch(`/previewFile?fileId=${file.id}`)
        .then(response => response.text())
        .then(text => {
          hideSpinner();
          const pre = document.createElement('pre');
          pre.style.maxWidth = '100%';
          pre.style.maxHeight = '100%';
          pre.style.overflow = 'auto';
          pre.style.padding = '15px';
          pre.style.backgroundColor = '#f4f4f4';
          pre.style.border = '1px solid #ddd';
          pre.style.fontSize = '14px';
          pre.style.color = '#333';
          pre.textContent = text;
          previewContent.appendChild(pre);
        })
        .catch(error => {
          hideSpinner();
          console.error("Error fetching text content:", error);
          const msg = document.createElement('p');
          msg.style.padding = '20px';
          msg.style.textAlign = 'center';
          msg.style.color = '#666';
          msg.textContent = 'Unable to preview this text file.';
          previewContent.appendChild(msg);
        });
    }
    // For other file types.
    else {
      hideSpinner();
      const msg = document.createElement('p');
      msg.style.padding = '20px';
      msg.style.textAlign = 'center';
      msg.style.color = '#666';
      msg.textContent = 'Preview not available for this file type.';
      previewContent.appendChild(msg);
    }
    
    previewModal.style.display = 'flex';
}

// Update the loading status message at the bottom
function updateLoadingStatus() {
    const loadingStatusElement = document.getElementById('loadingStatus'); // defined here
    if (loadingStatusElement) {
        if (isLoading) {
            loadingStatusElement.innerHTML = '<p>Loading...</p>';
        } else if (!nextPageToken) {
            loadingStatusElement.innerHTML = '<p>No more files</p>';
        } else {
            loadingStatusElement.innerHTML = '';
        }
    }
}

// Set up an IntersectionObserver to trigger infinite scrolling
function observeSentinel(sentinel) {
    const fileListElement = document.getElementById('fileList'); // added here
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading) {
                if (nextPageToken) {
                    fetchDriveFiles(currentFilter, currentFolderId, nextPageToken);
                } else {
                    updateLoadingStatus();
                }
            }
        });
    }, {
        root: fileListElement, // now defined locally
        threshold: 1.0
    });
    observer.observe(sentinel);
}

// Function to open the share modal and store the file ID
function openShareModal(fileId) {
    document.getElementById("shareFileId").value = fileId;
    // Reset the form to default state: "Specific User" mode and clear email field
    document.getElementById("shareTypeUser").checked = true;
    document.getElementById("emailField").style.display = "block";
    document.getElementById("shareEmail").value = "";
    // Hide previous messages
    const shareMessage = document.getElementById("shareMessage");
    shareMessage.style.display = "none";
    shareMessage.innerText = "";
    shareMessage.classList.remove("success", "error");
    document.getElementById("shareModal").style.display = "flex";
}
  
  // Function to close the share modal
function closeShareModal() {
    document.getElementById("shareModal").style.display = "none";
}

// Determines if a file’s MIME type is considered text-based.
function isTextType(mimeType) {
    return mimeType.startsWith("text/") ||
           mimeType === "application/json" ||
           mimeType === "application/javascript" ||
           mimeType === "application/xml" ||
           mimeType === "application/x-sh" ||
           mimeType === "application/x-shellscript" ||
           mimeType === "text/x-python" ||          // Python files
           mimeType === "text/x-java-source" ||      // Java source files
           mimeType === "text/x-c++src" ||           // C++ source files
           mimeType === "text/x-csrc" ||             // C source files
           mimeType === "text/x-csharp" ||           // C# files
           mimeType === "text/x-php" ||              // PHP files
           mimeType === "text/x-ruby";               // Ruby files
}

// Determines if a file is an Office document.
function isOfficeFile(mimeType) {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
           mimeType === 'application/msword' ||
           mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
           mimeType === 'application/vnd.ms-excel' ||
           mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
           mimeType === 'application/vnd.ms-powerpoint';
}

function showStatistics() {
    // Hide file section and show statistics section
    document.getElementById('fileSection').style.display = 'none';
    document.getElementById('statisticsSection').style.display = 'block';
    // Update active sidebar items (optional)
    setActiveSidebarItem('statisticsLink');
    // Load statistics data (for example, update security score, storage stats, etc.)
    loadStatistics();
}
  
function showFiles() {

    const statisticsSection = document.getElementById('statisticsSection');
    const fileSection = document.getElementById('fileSection');

    if (statisticsSection) statisticsSection.style.display = 'none';
    if (fileSection) fileSection.style.display = 'block';
    setActiveSidebarItem('homeLink');
    fetchDriveFiles();
}
  

async function updateSecurityScore() {
    try {
      const response = await fetch('/securityScore');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Update the security score card
      const scoreCardValue = document.querySelector('.card.security-score .card-value');
      const scoreCardSubtext = document.querySelector('.card.security-score .card-subtext');
      if (scoreCardValue && scoreCardSubtext) {
        scoreCardValue.textContent = data.score + "%";
        scoreCardSubtext.textContent = data.message;
      }
    } catch (error) {
      console.error("Error updating security score:", error);
    }
}

async function updateSecurityStats() {
    const securityScoreE1 = document.getElementById('securityScoreValue');
    securityScoreE1.innerHTML = '<span class="spinner-small"></span>';
    try {
      const response = await fetch('/securityScore');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      securityScoreE1.textContent = data.score + '%';
      document.getElementById('securityScoreDesc').textContent = data.message;
      document.getElementById('totalFilesValue').textContent = data.totalFiles;
      document.getElementById('encryptedFilesValue').textContent = data.encryptedFiles;
    } catch (error) {
      console.error("Error updating security stats:", error);
    }
}
  

async function loadSecurityChart() {
    try {
      const res = await fetch('/securityScore');
      const data = await res.json();
      const ctx = document.getElementById('securityChart').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Encrypted', 'Not Encrypted'],
          datasets: [{
            data: [data.encryptedFiles, data.totalFiles - data.encryptedFiles],
            backgroundColor: ['#4caf50', '#f44336']
          }]
        },
        options: {
          title: {
            display: true,
            text: 'Encryption Ratio'
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.raw;
                  return `${label}: ${value} files`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Error loading security chart:", error);
    }
}

const centerLegendPlugin = {
    id: 'centerLegend',
    afterDraw: function(chart) {
      const ctx = chart.ctx;
      const { chartArea } = chart;
  
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;
  
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '16px Arial';
  
      // "Used" text in orange
      ctx.fillStyle = '#ff9800';
      ctx.fillText('Used', centerX, centerY - 10);
  
      // "Available" text in green
      ctx.fillStyle = '#8bc34a';
      ctx.fillText('Available', centerX, centerY + 15);
  
      ctx.restore();
    }
};
   
async function updateStorageStats() {
    const storageValueEl = document.getElementById('storageUsedValue');
    storageValueEl.innerHTML = '<span class="spinner-small"></span>'; // Show spinner while loading
  
    try {
      const response = await fetch('/driveStorageStats');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  
      const data = await response.json();
      const usageGB = (data.usage / (1024 * 1024 * 1024)).toFixed(2);
      const limitGB = (data.limit / (1024 * 1024 * 1024)).toFixed(2);
      const percentUsed = limitGB > 0 ? Math.round((usageGB / limitGB) * 100) : 0;
  
      storageValueEl.textContent = usageGB + ' GB';
      document.getElementById('storageStatsDesc').textContent = percentUsed + '% of quota';
  
      const ctx = document.getElementById('storageChartSmall').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Used', 'Available'],
          datasets: [{
            data: [percentUsed, 100 - percentUsed],
            backgroundColor: ['#ff9800', '#8bc34a']
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }, // Hides external legend
            tooltip: { enabled: false }  // Disables tooltip
          },
          cutout: '70%' // Ensures space for text inside the ring
        },
        plugins: [centerLegendPlugin]  // Custom plugin for colored text inside the ring
      });
    } catch (error) {
      console.error("Error updating storage stats:", error);
    }
}
  
  
async function loadFileTypeChartSmall() {
    try {
      const response = await fetch('/fileTypeStats');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const labels = Object.keys(data);
      const counts = Object.values(data);
      const ctx = document.getElementById('fileTypeChartSmall').getContext('2d');
      new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: counts,
            backgroundColor: ['#2196f3', '#4caf50', '#ff9800', '#9c27b0']
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
                display: true, 
                position: 'bottom',
                labels: {
                    boxWidth: 12,
                    padding: 10,
                    align: 'center'
                } 
            },
            title: { display: false }
          }
        }
      });
    } catch (error) {
      console.error("Error loading file type chart:", error);
    }
}

async function updateSharedFilesCount() {
    try {
      const response = await fetch('/countSharedFiles');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      document.getElementById('sharedFilesValue').textContent = data.count;
      document.getElementById('sharedFilesDesc').textContent = "Files you have shared";
    } catch (error) {
      console.error("Error updating shared files count:", error);
    }
}

async function updateUniqueCollaboratorsCount() {
    const collabValueEl = document.getElementById('collaboratorsValue');
    // Set a small spinner or "Loading..." text
    collabValueEl.innerHTML = '<span class="spinner-small"></span>';
    try {
      const response = await fetch('/uniqueCollaborators');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      collabValueEl.textContent = data.count;
      document.getElementById('collaboratorsDesc').textContent = "Unique people shared with";
    } catch (error) {
      console.error("Error updating unique collaborators count:", error);
      collabValueEl.textContent = 0;
    }
}

async function updateTopCollaborators() {
    const topCollabEl = document.getElementById('topCollaborators');
    topCollabEl.innerHTML = '<span class="spinner-small"></span>';
    try {
      const response = await fetch('/topCollaborators');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      topCollabEl.innerHTML = data.map(collab => `
        <div class="collaborator-item">
          <span class="collaborator-email" title="${collab.email}">${collab.email}</span> - 
          <span>${collab.filesShared} files</span>
        </div>`).join('');
    } catch (error) {
      console.error("Error updating top collaborators:", error);
      topCollabEl.textContent = 'Error loading data';
    }
}

async function updateRecentFiles() {
  const recentFilesEl = document.getElementById('recentFiles');
  // Insert only the spinner (without extra text)
  recentFilesEl.innerHTML = '<tr><td colspan="3"><span class="spinner-small"></span></td></tr>';
  try {
      const response = await fetch('/recentFiles');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const files = await response.json();
      if (files.length > 0) {
          recentFilesEl.innerHTML = files.slice(0, 5).map(file => `
              <tr>
                  <td>${file.name}</td>
                  <td>${new Date(file.modifiedTime).toLocaleDateString()}</td>
                  <td>${file.size ? (file.size / (1024 * 1024)).toFixed(2) : '—'} MB</td>
              </tr>
          `).join('');
      } else {
          recentFilesEl.innerHTML = '<tr><td colspan="3">No recent files found</td></tr>';
      }
  } catch (error) {
      console.error("Error updating recent files:", error);
      recentFilesEl.innerHTML = '<tr><td colspan="3">Error loading data</td></tr>';
  }
}

async function loadStorageGrowthTrend() {
    try {
      const response = await fetch('/storageTrend');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const ctx = document.getElementById('storageTrendChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.dates,
          datasets: [{
            label: 'Storage Used (GB)',
            data: data.usage,
            borderColor: '#4caf50',
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => value + ' GB'
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Error loading storage growth trend:", error);
    }
}
  
async function loadStatistics() {
    await Promise.all([
        updateSecurityStats(),
        updateStorageStats(),
        loadFileTypeChartSmall(),
        updateSharedFilesCount(),
        updateUniqueCollaboratorsCount(),
        updateTopCollaborators(),
        updateRecentFiles(),
        loadStorageGrowthTrend()
    ]);
}
  

  

// Close preview modal without assuming previewFrame exists
document.getElementById("previewClose").addEventListener("click", function() {
    const previewModal = document.getElementById("previewModal");
    const previewContent = previewModal.querySelector('.preview-modal-content');
    // Clear preview content
    previewContent.innerHTML = "";
    previewModal.style.display = "none";
});

document.addEventListener('DOMContentLoaded', () => {
    const previewModal = document.getElementById('previewModal');
    if (previewModal) {
      previewModal.style.display = 'none';
    }
});