import { generateAndStorePasswordRecovery } from './passwordRecovery.js';

document.addEventListener("DOMContentLoaded", () => {
  const passwordForm = document.getElementById("passwordForm");
  const errorMessage = document.getElementById("errorMessage");
  const skipEncryptionButton = document.getElementById("skipEncryption");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const requirements = {
    length: { regex: /.{10,}/, element: document.getElementById("length-req") },
    uppercase: { regex: /[A-Z]/, element: document.getElementById("uppercase-req") },
    lowercase: { regex: /[a-z]/, element: document.getElementById("lowercase-req") },
    special: { regex: /[!@#$%^&*]/, element: document.getElementById("special-req") },
  };

  function validatePassword(password) {
    let isValid = true;
    for (const [key, requirement] of Object.entries(requirements)) {
      const valid = requirement.regex.test(password);
      requirement.element.classList.toggle("valid", valid);
      requirement.element.querySelector("i").className = valid ? "fas fa-circle-check" : "fas fa-circle-xmark";
      isValid = isValid && valid;
    }
    return isValid;
  }

  passwordInput.addEventListener("input", () => {
    validatePassword(passwordInput.value);
  });

  if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (password !== confirmPassword) {
        showError("Passwords do not match");
        return;
      }

      if (!validatePassword(password)) {
        showError("Password does not meet all requirements");
        return;
      }

      try {
        // First, call your endpoint to create the encrypted password hash.
        const response = await fetch("/api/createEncryptionKey", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
          credentials: "include",
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to create encryption key");
        }
        const data = await response.json();
        console.log("Encryption key created successfully");

        // Now, also encrypt the plaintext password for recovery.
        const mnemonic = await generateAndStorePasswordRecovery(password);
        // Show the mnemonic (seed phrase) to the user.
        alert(
          "Your recovery seed phrase is:\n\n" +
          mnemonic +
          "\n\nPlease store it securely. You will need this phrase to recover your password if you forget it."
        );

        // Redirect to the dashboard.
        window.location.href = "/dashboard.html";
      } catch (error) {
        console.error("Error creating encryption key:", error);
        showError(error.message || "Failed to create encryption key. Please try again.");
      }
    });
  } else {
    console.error("Password form not found");
  }

  if (skipEncryptionButton) {
    skipEncryptionButton.addEventListener("click", () => {
      fetch("/api/skipEncryption", {
        method: "POST",
        credentials: "include",
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((err) => Promise.reject(err));
          }
          return response.json();
        })
        .then((data) => {
          console.log("Encryption skipped successfully");
          window.location.href = "/dashboard.html";
        })
        .catch((error) => {
          console.error("Error skipping encryption:", error);
          showError("Failed to skip encryption. Please try again.");
        });
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
});
