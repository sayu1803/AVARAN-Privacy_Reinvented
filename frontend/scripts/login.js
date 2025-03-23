// document.addEventListener('DOMContentLoaded', function() {
//   const googleLoginButton = document.getElementById('googleLoginButton');
//   const loginMessage = document.getElementById('loginMessage');

//   function updateLoginMessage(message, isError) {
//     const loginMessageElement = document.getElementById('loginMessage');
//     loginMessageElement.textContent = message;
//     loginMessageElement.style.color = isError ? 'red' : '#2f7283';
//   }

//   function checkAuthentication() {
//     fetch('/api/checkAuth', { credentials: 'include' })
//       .then(response => {
//         if (!response.ok) {
//           throw new Error('Authentication check failed');
//         }
//         return response.json();
//       })
//       .then(data => {
//         if (data.authenticated) {
//           updateLoginMessage('Authentication successful. Checking login status...');
//           checkLoginStatus();
//         } else {
//           updateLoginMessage('Please log in.');
//         }
//       })
//       .catch(error => {
//         console.error('Error checking authentication:', error);
//         updateLoginMessage('Unable to check authentication status. Please try again.', true);
//       });
//   }
  

//   function checkLoginStatus() {
//     fetch('/api/checkLoginStatus', { credentials: 'include' })
//       .then(response => {
//         if (!response.ok) {
//           throw new Error('Login status check failed');
//         }
//         return response.json();
//       })
//       .then(data => {
//         if (data.encryptionEnabled && data.passwordSet) {
//           window.location.href = '/password-verification.html';
//         } else if (data.encryptionEnabled && !data.passwordSet) {
//           window.location.href = '/password-creation.html';
//         } else {
//           window.location.href = '/dashboard.html';
//         }
//       })
//       .catch(error => {
//         console.error('Error checking login status:', error);
//         updateLoginMessage('Unable to check login status. Please try again.', true);
//       });
//   }

//   googleLoginButton.addEventListener('click', () => {
//     updateLoginMessage('Redirecting to Google login...');
//     window.location.href = '/auth/google';
//   });

//   // Check for error message in URL
//   const urlParams = new URLSearchParams(window.location.search);
//   const errorMessage = urlParams.get('error');
//   if (errorMessage) {
//     updateLoginMessage(decodeURIComponent(errorMessage), true);
//   } else {
//     // Only check authentication if there's no error message
//     checkAuthentication();
//   }
// });

document.addEventListener('DOMContentLoaded', function() {
  const googleLoginButton = document.getElementById('googleLoginButton');
  const loginMessage = document.getElementById('loginMessage');

  function updateLoginMessage(message, isError) {
    const loginMessageElement = document.getElementById('loginMessage');
    loginMessageElement.textContent = message;
    loginMessageElement.style.color = isError ? 'red' : '#2f7283';
  }

  function checkAuthentication() {
    fetch('/api/checkAuth', { credentials: 'include' })
      .then(response => {
        if (!response.ok) {
          throw new Error('Authentication check failed');
        }
        return response.json();
      })
      .then(data => {
        if (data.authenticated) {
          updateLoginMessage('Authentication successful. Checking login status...');
          checkLoginStatus();
        } else {
          updateLoginMessage('Please log in.');
        }
      })
      .catch(error => {
        console.error('Error checking authentication:', error);
        updateLoginMessage('Unable to check authentication status. Please try again.', true);
      });
  }
  
  function checkLoginStatus() {
    fetch('/api/checkLoginStatus', { credentials: 'include' })
      .then(response => {
        if (!response.ok) {
          throw new Error('Login status check failed');
        }
        return response.json();
      })
      .then(data => {
        if (data.encryptionEnabled && data.passwordSet) {
          window.location.href = '/password-verification.html';
        } else if (data.encryptionEnabled && !data.passwordSet) {
          window.location.href = '/password-creation.html';
        } else {
          window.location.href = '/dashboard.html';
        }
      })
      .catch(error => {
        console.error('Error checking login status:', error);
        updateLoginMessage('Unable to check login status. Please try again.', true);
      });
  }

  googleLoginButton.addEventListener('click', () => {
    updateLoginMessage('Redirecting to Google login...');
    // Use a full URL when loaded from file:// so that relative paths aren’t misinterpreted.
    if (window.location.protocol === 'file:') {
      window.location.href = 'http://localhost:8000/auth/google';
    } else {
      window.location.href = '/auth/google';
    }
  });

  // Check for error message in URL
  const urlParams = new URLSearchParams(window.location.search);
  const errorMessage = urlParams.get('error');
  if (errorMessage) {
    updateLoginMessage(decodeURIComponent(errorMessage), true);
  } else {
    checkAuthentication();
  }
});
