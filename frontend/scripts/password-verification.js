document.addEventListener("DOMContentLoaded", () => {
  const passwordForm = document.getElementById("passwordForm");
  const errorMessage = document.getElementById("errorMessage");

  // Password verification submission
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/verifyPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Password verification failed");
      }
      const data = await response.json();
      if (data.verified) {
        console.log("Password verified successfully");

        // Check if recovery data exists
        try {
          const checkResponse = await fetch("/api/checkRecovery", {
            credentials: "include",
          });
          const checkData = await checkResponse.json();
          if (!checkData.exists) {
            // Open custom recovery prompt modal instead of using confirm()
            const userChoice = await openRecoveryPromptModal();
            if (userChoice) {
              // Call endpoint to set up recovery using the current plaintext password.
              const setupResponse = await fetch("/api/setupRecovery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
                credentials: "include",
              });
              const setupData = await setupResponse.json();
              if (setupResponse.ok && setupData.mnemonic) {
                // Open the recovery setup modal to display the mnemonic.
                openRecoverySetupModal(setupData.mnemonic);
                // Wait here—do not redirect yet. The user must click "Done" in the modal.
                return; // Exit early to let the user copy and acknowledge.
              } else {
                console.error("Recovery setup failed:", setupData.error);
              }
            } else {
              // User declined to set up recovery; proceed with login.
              window.location.href = "/dashboard.html";
            }
          } else {
            // Recovery data already exists; proceed with login.
            window.location.href = "/dashboard.html";
          }
        } catch (err) {
          console.error("Error checking recovery data:", err);
          window.location.href = "/dashboard.html";
        }
      } else {
        showError("Incorrect password. Please try again.");
      }
    } catch (error) {
      console.error("Error verifying password:", error);
      showError("Failed to verify password. Please try again.");
    }
  });

  // Event listener for the "Forgot Password?" button
  const forgotPasswordBtn = document.getElementById("forgotPassword");
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
      // Check if recovery data exists
      try {
        const checkResponse = await fetch("/api/checkRecovery", {
          credentials: "include",
        });
        const checkData = await checkResponse.json();
        if (!checkData.exists) {
          // Open a modal informing the user that no recovery data exists.
          openRecoveryNotSetupModal();
        } else {
          // Open the recovery input modal.
          openRecoveryModal();
        }
      } catch (err) {
        console.error("Error checking recovery data:", err);
        openRecoveryModal(); // Fallback: allow recovery input.
      }
    });
  }

  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = "block";
    } else {
      console.error("Error message element not found");
    }
  }

  /* Recovery Prompt Modal (to ask if user wants to set up recovery) */
  const recoveryPromptModal = document.getElementById("recoveryPromptModal");
  const recoveryPromptYes = document.getElementById("recoveryPromptYes");
  const recoveryPromptNo = document.getElementById("recoveryPromptNo");
  function openRecoveryPromptModal() {
    recoveryPromptModal.style.display = "flex";
    return new Promise((resolve) => {
      function onYes() {
        closeRecoveryPromptModal();
        recoveryPromptYes.removeEventListener("click", onYes);
        recoveryPromptNo.removeEventListener("click", onNo);
        resolve(true);
      }
      function onNo() {
        closeRecoveryPromptModal();
        recoveryPromptYes.removeEventListener("click", onYes);
        recoveryPromptNo.removeEventListener("click", onNo);
        resolve(false);
      }
      recoveryPromptYes.addEventListener("click", onYes);
      recoveryPromptNo.addEventListener("click", onNo);
    });
  }
  function closeRecoveryPromptModal() {
    recoveryPromptModal.style.display = "none";
  }

  /* Recovery Not Setup Modal (for when user clicks "Forgot Password?" but no recovery data exists) */
  const recoveryNotSetupModal = document.getElementById("recoveryNotSetupModal");
  const recoveryNotSetupClose = document.getElementById("recoveryNotSetupClose");
  function openRecoveryNotSetupModal() {
    recoveryNotSetupModal.style.display = "flex";
  }
  function closeRecoveryNotSetupModal() {
    recoveryNotSetupModal.style.display = "none";
  }
  recoveryNotSetupClose.addEventListener("click", closeRecoveryNotSetupModal);

  /* Recovery Input Modal functionality */
  const recoveryModal = document.getElementById("recoveryModal");
  const recoveryClose = document.getElementById("recoveryClose");
  const recoverySubmit = document.getElementById("recoverySubmit");
  const recoveryInput = document.getElementById("recoveryInput");
  const recoveryError = document.getElementById("recoveryError");

  function openRecoveryModal() {
    recoveryInput.value = "";
    recoveryError.style.display = "none";
    recoveryModal.style.display = "flex";
  }
  function closeRecoveryModal() {
    recoveryModal.style.display = "none";
  }
  recoveryClose.addEventListener("click", closeRecoveryModal);

  recoverySubmit.addEventListener("click", async () => {
    recoveryError.style.display = "none";
    const mnemonic = recoveryInput.value.trim();
    if (!mnemonic) {
      recoveryError.textContent = "Please enter your recovery seed phrase.";
      recoveryError.style.display = "block";
      return;
    }
    try {
      const response = await fetch("/api/recoverPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mnemonic }),
      });
      const data = await response.json();
      if (response.ok && data.password) {
        openRecoveredPasswordModal(data.password);
        closeRecoveryModal();
      } else {
        throw new Error();
      }
    } catch (error) {
      console.error("Error recovering password:", error);
      recoveryError.textContent = "Failed to recover password. Please check the seed phrase and try again.";
      recoveryError.style.display = "block";
    }
  });
  window.addEventListener("click", (e) => {
    if (e.target === recoveryModal) {
      closeRecoveryModal();
    }
    if (e.target === recoveryNotSetupModal) {
      closeRecoveryNotSetupModal();
    }
  });

  /* Recovery Setup Modal functionality (for displaying the seed phrase) */
  const recoverySetupModal = document.getElementById("recoverySetupModal");
  const recoverySetupClose = document.getElementById("recoverySetupClose");
  const seedPhraseContainer = document.getElementById("seedPhraseContainer");
  const copySeedPhraseBtn = document.getElementById("copySeedPhraseBtn");
  const recoverySetupDone = document.getElementById("recoverySetupDone"); // New "Done" button

  function openRecoverySetupModal(mnemonic) {
    seedPhraseContainer.textContent = mnemonic;
    recoverySetupModal.style.display = "flex";
  }
  function closeRecoverySetupModal() {
    recoverySetupModal.style.display = "none";
  }
  recoverySetupClose.addEventListener("click", closeRecoverySetupModal);
  recoverySetupDone.addEventListener("click", () => {
    closeRecoverySetupModal();
    // After the user has seen and copied the seed phrase, redirect to dashboard.
    window.location.href = "/dashboard.html";
  });

  copySeedPhraseBtn.addEventListener("click", () => {
    const mnemonic = seedPhraseContainer.textContent;
    navigator.clipboard.writeText(mnemonic)
      .then(() => {
        copySeedPhraseBtn.textContent = "Copied!";
        copySeedPhraseBtn.disabled = true;
        setTimeout(() => {
          copySeedPhraseBtn.textContent = "Copy Seed Phrase";
          copySeedPhraseBtn.disabled = false;
        }, 2000);
      })
      .catch((err) => {
        console.error("Copy failed:", err);
        copySeedPhraseBtn.textContent = "Copy Failed";
        setTimeout(() => {
          copySeedPhraseBtn.textContent = "Copy Seed Phrase";
        }, 2000);
      });
  });

  /* Recovered Password Modal functionality (for displaying the recovered password) */
  const recoveredPasswordModal = document.getElementById("recoveredPasswordModal");
  const recoveredPasswordClose = document.getElementById("recoveredPasswordClose");
  const recoveredPasswordMessage = document.getElementById("recoveredPasswordMessage");
  const copyRecoveredPasswordBtn = document.getElementById("copyRecoveredPasswordBtn");

  function openRecoveredPasswordModal(password) {
    recoveredPasswordMessage.textContent = password;
    recoveredPasswordModal.style.display = "flex";
  }
  function closeRecoveredPasswordModal() {
    recoveredPasswordModal.style.display = "none";
  }
  recoveredPasswordClose.addEventListener("click", closeRecoveredPasswordModal);
  copyRecoveredPasswordBtn.addEventListener("click", () => {
    const password = recoveredPasswordMessage.textContent;
    navigator.clipboard.writeText(password)
      .then(() => {
        copyRecoveredPasswordBtn.textContent = "Copied!";
        copyRecoveredPasswordBtn.disabled = true;
        setTimeout(() => {
          copyRecoveredPasswordBtn.textContent = "Copy Password";
          copyRecoveredPasswordBtn.disabled = false;
        }, 2000);
      })
      .catch((err) => {
        console.error("Copy failed:", err);
        copyRecoveredPasswordBtn.textContent = "Copy Failed";
        setTimeout(() => {
          copyRecoveredPasswordBtn.textContent = "Copy Password";
        }, 2000);
      });
  });
  window.addEventListener("click", (e) => {
    if (e.target === recoveredPasswordModal) {
      closeRecoveredPasswordModal();
    }
  });
});
