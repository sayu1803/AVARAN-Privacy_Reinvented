import dotenv from "dotenv"
dotenv.config()

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { google } from "googleapis"
import express from "express"
import bodyParser from "body-parser"
import mime from "mime-types"
import multer from "multer"
import cors from "cors"
import crypto from "crypto"
import { Readable } from "stream"
import Registry from "winreg"
import { generateAndStoreKEK, retrieveKEK, encryptData, decryptData } from "./frontend/scripts/keyManagement.js"
import { recoverPassword, generateAndStorePasswordRecovery, recoveryDataExists } from './frontend/scripts/passwordRecovery.js';
import dns from "dns"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });
function log(message) {
  console.log(message);
  logStream.write(new Data().toISOString() + " " + message + "\n");
}

const app = express()
app.use(bodyParser.json())
app.use(
  cors({
    origin: "http://localhost:8000", // Replace with your client origin
    credentials: true, // Allow cookies to be sent with requests
  }),
) // Use CORS middleware

const isDev = process.env.NODE_ENV === "development"

const frontendDirectoryPath = isDev ? path.join(__dirname, "../frontend") : path.join(__dirname, "frontend")

// Serve static files from the frontend directory
app.use(express.static(frontendDirectoryPath))

// Serve login.html at the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend/login.html"))
})

const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.REDIRECT_URI)

let tokens

try {
  const tokenData = fs.readFileSync(path.join(__dirname, "tokens.json"), "utf8")
  tokens = JSON.parse(tokenData)
  oauth2Client.setCredentials(tokens)
} catch (err) {
  console.log("No tokens file found. User will need to authenticate.")
}

const PORT = process.env.PORT || 8000

// Correct multer configuration
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true)
  },
})

const USER_PREFERENCES_FILE = path.join(__dirname, "userPreferences.json")

app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      // "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/contacts.readonly",
      // "https://www.googleapis.com/auth/drive.file",
      // "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/drive"
    ],
  })
  console.log("Generated Auth URL:", authUrl);
  res.redirect(authUrl)
})

app.get("/google/redirect", async (req, res) => {
  try {
    const { code } = req.query
    const { tokens: newTokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(newTokens)
    tokens = newTokens

    // Save tokens to file
    fs.writeFileSync(path.join(__dirname, "tokens.json"), JSON.stringify(newTokens))

    // Set a cookie to indicate the user is authenticated
    res.cookie("authenticated", "true", { httpOnly: true, secure: true, sameSite: "Lax" })

    // Check if a password has been set in the registry
    const passwordSet = await isPasswordSet()
    console.log("Is password set?", passwordSet)

    if (!passwordSet) {
      console.log("Redirecting to password creation page")
      res.redirect("/password-creation.html")
    } else {
      console.log("Redirecting to password verification page")
      res.redirect("/password-verification.html")
    }
  } catch (err) {
    console.error("Error in /google/redirect:", err)
    res.redirect("/?error=" + encodeURIComponent("Authentication failed. Please try again."))
  }
})

app.get("/api/checkLoginStatus", async (req, res) => {
  try {
    ensureUserPreferencesFile()
    const preferences = JSON.parse(fs.readFileSync(USER_PREFERENCES_FILE, "utf8"))
    const encryptionEnabled = preferences.encryptionEnabled
    const passwordSet = await isPasswordSet()
    res.json({ encryptionEnabled, passwordSet })
  } catch (error) {
    console.error("Error checking login status:", error)
    res.status(500).json({ error: "Failed to check login status" })
  }
})

// Add a route to handle password creation
app.post("/api/createEncryptionKey", async (req, res) => {
  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: "Password is required" })
  }

  try {
    // Generate and store the KEK
    await generateAndStoreKEK()

    // Retrieve the KEK
    const { kek } = await retrieveKEK()

    // Encrypt the password using the KEK
    const encryptedPassword = encryptData(password, kek)

    // Store the encrypted password in the Windows registry
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: "\\Software\\GoogleDriveClient",
    })

    await new Promise((resolve, reject) => {

      const hexValue = Buffer.from(JSON.stringify(encryptedPassword)).toString("hex");

      regKey.set("EncryptedPassword", Registry.REG_BINARY, hexValue, (err) => {
        if (err) {
          console.error("Error writing to registry:", err)
          reject(err)
        } else {
          resolve()
        }
      })
    })

    res.json({ message: "Encryption key created and password stored successfully" })
  } catch (error) {
    console.error("Error creating encryption key:", error)
    res.status(500).json({ error: "Failed to create encryption key", details: error.message })
  }
})

// Add a route to handle password verification
app.post("/api/verifyPassword", async (req, res) => {
  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: "Password is required" })
  }

  try {
    const storedEncryptedPassword = await getEncryptedPasswordFromRegistry()
    if (!storedEncryptedPassword) {
      return res.status(400).json({ error: "No password has been set" })
    }

    // Retrieve the KEK
    const { kek } = await retrieveKEK()

    // Decrypt the stored password
    const decryptedStoredPassword = decryptData(storedEncryptedPassword, kek)

    // Compare the decrypted stored password with the input password
    const verified = password === decryptedStoredPassword

    res.json({ verified })
  } catch (error) {
    console.error("Error verifying password:", error)
    res.status(500).json({ error: "Failed to verify password" })
  }
})

// Route to fetch files from Google Drive
app.get("/listFiles", async (req, res) => {
  try {
    const { filter, folderId, pageToken } = req.query
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    let query = folderId ? `'${folderId}' in parents` : "'root' in parents";

    const response = await drive.files.list({
      q: query,
      pageSize: 30,
      pageToken: pageToken || undefined,
      fields:
        "nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, iconLink, size, modifiedTime, owners, properties)",
    })

    let files = response.data.files

    if (filter === "files") {
      files = files.filter((file) => file.mimeType !== "application/vnd.google-apps.folder")
    } else if (filter === "folders") {
      files = files.filter((file) => file.mimeType === "application/vnd.google-apps.folder")
    } else if (filter === "secure") {
      files = files.filter((file) => file.properties && file.properties.encrypted === "true")
    }

    // Add encrypted property to the file objects
    files = files.map((file) => ({
      ...file,
      encrypted: file.properties && file.properties.encrypted === "true",
    }))

    if (files.length === 0) {
      res.json({files: [], nextPageToken: null});
    } else {
      res.json({files, nextPageToken: response.data.nextPageToken || null});
    }
  } catch (error) {
    console.error("Error fetching files:", error.message)
    res.status(500).send("Failed to retrieve files.")
  }
})

app.get("/api/searchDrive", async (req, res) => {
  try {
    const { q } = req.query
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    const response = await drive.files.list({
      q: `fullText contains '${q}'`,
      fields: "files(id, name, mimeType, webViewLink, modifiedTime, size, owners)",
      pageSize: 30,
    })

    const files = response.data.files.map((file) => ({
      ...file,
      source: "drive",
      webContentLink: file.webViewLink,
      properties: { encrypted: false },
    }))

    res.json(files)
  } catch (error) {
    console.error("Error searching Drive:", error)
    res.status(500).json({ error: "Failed to search Drive" })
  }
})

app.post("/uploadFile", upload.single("file"), async (req, res) => {
  try {
    const file = req.file
    const isEncrypted = req.body.isEncrypted === "true"
    const metadata = JSON.parse(req.body.metadata || "{}")

    if (!file) {
      return res.status(400).send("No file uploaded.")
    }

    console.log("File details:", file)
    console.log("Is encrypted:", isEncrypted)

    const drive = google.drive({ version: "v3", auth: oauth2Client })

    let fileContent = await fs.promises.readFile(file.path)

    if (isEncrypted) {
      fileContent = await encryptFile(fileContent)
      console.log("File encrypted successfully")
    }

    const fileMetadata = {
      name: file.originalname,
      mimeType: isEncrypted ? "application/octet-stream" : mime.lookup(file.originalname) || "application/octet-stream",
      properties: {
        ...metadata.properties,
        encrypted: isEncrypted,
        originalMimeType: metadata.properties.originalMimeType || mime.lookup(file.originalname),
        encryptionAlgorithm: isEncrypted ? metadata.properties.encryptionAlgorithm : "none",
      },
    }

    const media = {
      mimeType: fileMetadata.mimeType,
      body: Readable.from(fileContent),
    }

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    })

    await fs.promises.unlink(file.path)
    console.log("File uploaded successfully with ID:", response.data.id)

    res.json({ fileId: response.data.id })
  } catch (error) {
    console.error("Error uploading file:", error)
    res.status(500).send(`Failed to upload file. Error: ${error.message}`)
  }
})

app.post("/uploadFolder", upload.array("files"), async (req, res) => {
  try {
    const folderName = req.body.folderName
    if (!folderName) {
      console.error("No folder name provided")
      return res.status(400).send("No folder name provided.")
    }

    console.log("Creating folder:", folderName)
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    // Create a folder on Google Drive
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }

    const folderResponse = await drive.files.create({
      resource: folderMetadata,
      fields: "id",
    })

    const folderId = folderResponse.data.id
    console.log("Folder created successfully with ID:", folderId)

    // Upload files into the created folder
    const filePromises = req.files.map((file) => {
      console.log("Uploading file:", file.originalname)
      const mimeType = mime.lookup(file.originalname) || "application/octet-stream"
      return drive.files
        .create({
          requestBody: {
            name: file.originalname,
            parents: [folderId], // Specify the parent folder ID
            mimeType: mimeType,
          },
          media: {
            mimeType: mimeType,
            body: fs.createReadStream(file.path),
          },
        })
        .then((response) => {
          fs.unlinkSync(file.path) // Remove the file after uploading
          return response.data.id
        })
    })

    const fileIds = await Promise.all(filePromises)
    console.log("Files uploaded successfully:", fileIds)
    res.send(
      `Folder '${folderName}' created successfully with ID: ${folderId}, and files uploaded: ${fileIds.join(", ")}`,
    )
  } catch (error) {
    console.error("Error uploading folder:", error.message)
    res.status(500).send("Failed to create folder or upload files. Please try again.")
  }
})

app.get("/api/userProfile", isAuthenticated, async (req, res) => {
  console.log("Received request for /api/userProfile")
  try {
    // Check if the access token is expired and refresh if necessary
    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      tokens = credentials
      fs.writeFileSync(path.join(__dirname, "tokens.json"), JSON.stringify(credentials))
      console.log("Access token refreshed and saved")
    }

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client })
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    // Fetch basic user info
    const { data: userInfo } = await oauth2.userinfo.get()

    // Fetch user's Drive usage
    const { data: about } = await drive.about.get({
      fields: "storageQuota, user",
    })

    // Fetch recent files
    const { data: files } = await drive.files.list({
      pageSize: 10,
      fields: "files(id, name, mimeType, modifiedTime)",
      orderBy: "modifiedTime desc",
    })

    const userProfile = {
      name: userInfo.name,
      email: userInfo.email,
      profilePicture: userInfo.picture,
      storageUsed: about.storageQuota.usage,
      storageLimit: about.storageQuota.limit,
      driveLocale: about.user.emailAddress,
      recentFiles: files.files.map((file) => ({
        name: file.name,
        type: file.mimeType,
        lastModified: file.modifiedTime,
      })),
      jobTitle: "Software Engineer",
      department: "Engineering",
      location: "San Francisco, CA",
      joinDate: "2022-01-01",
    }

    console.log("Fetched user profile:", userProfile)
    res.json(userProfile)
  } catch (error) {
    console.error("Error in /api/userProfile:", error)
    if (error.code === 401) {
      res.status(401).json({ error: "Authentication failed", details: "Please re-authenticate" })
    } else if (error.code === 403) {
      res.status(403).json({ error: "Insufficient permissions", details: "Please check the requested scopes" })
    } else {
      res.status(500).json({ error: "Failed to fetch user profile", details: error.message })
    }
  }
})

app.post("/api/signout", (req, res) => {
  try {
    // Clear the tokens
    tokens = null
    oauth2Client.revokeCredentials((err) => {
      if (err) {
        console.error("Error revoking credentials:", err)
      }
      // Delete the stored tokens file
      fs.unlink(path.join(__dirname, "tokens.json"), (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting tokens file:", unlinkErr)
        }
        res.json({ message: "Successfully signed out" })
      })
    })
  } catch (error) {
    console.error("Error during sign-out:", error)
    res.status(500).json({ error: "An error occurred during sign-out" })
  }
})

function isAuthenticated(req, res, next) {
  if (!tokens) {
    return res.status(401).json({ error: "User not authenticated" })
  }
  next()
}

app.get("/api/checkAuth", (req, res) => {
  console.log("Checking authentication status")
  res.json({ authenticated: !!tokens })
})

app.delete("/deleteFile/:fileId", isAuthenticated, async (req, res) => {
  try {
    const fileId = req.params.fileId
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    await drive.files.delete({
      fileId: fileId,
    })

    res.json({ message: "File deleted successfully" })
  } catch (error) {
    console.error("Error deleting file:", error)
    res.status(500).json({ error: "Failed to delete file" })
  }
})

app.get("/api/downloadFile/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId
    const drive = google.drive({ version: "v3", auth: oauth2Client })

    console.log(`Attempting to download file with ID: ${fileId}`)

    const file = await drive.files.get({
      fileId: fileId,
      fields: "name, mimeType, properties",
    })

    console.log(`File details:`, file.data)

    const isEncrypted = file.data.properties && file.data.properties.encrypted === "true"
    const encryptionAlgorithm = file.data.properties && file.data.properties.encryptionAlgorithm
    console.log(`Is file encrypted: ${isEncrypted}, Algorithm: ${encryptionAlgorithm}`)

    const response = await drive.files.get({ fileId: fileId, alt: "media" }, { responseType: "arraybuffer" })

    let fileContent = Buffer.from(response.data)
    console.log(`File content length: ${fileContent.length} bytes`)

    if (isEncrypted) {
      try {
        fileContent = await decryptFile(fileContent)
        console.log("File decrypted successfully")
      } catch (decryptionError) {
        console.error("Error decrypting file:", decryptionError)
        return res.status(500).json({ error: `Failed to decrypt file: ${decryptionError.message}` })
      }
    }

    const fileName = file.data.name
    const mimeType = isEncrypted ? file.data.properties.originalMimeType : file.data.mimeType

    res.setHeader("Content-disposition", `attachment; filename=${fileName}`)
    res.setHeader("Content-type", mimeType || "application/octet-stream")
    res.send(fileContent)
    console.log(`File sent successfully: ${fileName}`)
  } catch (error) {
    console.error("Error downloading file:", error)
    res.status(500).json({ error: `Failed to download file. Error: ${error.message}` })
  }
})

app.get("/previewFile", async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) {
    return res.status(400).send("File ID is required.");
  }
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    
    // First, get the file metadata (to retrieve the MIME type and filename)
    const metadataResponse = await drive.files.get({
      fileId,
      fields: "mimeType, name"
    });
    const mimeType = metadataResponse.data.mimeType;
    const fileName = metadataResponse.data.name;
    
    // Then, get the file content as a stream
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );
    
    // Set the appropriate headers:
    // - Content-Type: Set to the file's MIME type.
    // - Content-Disposition: Inline so that the browser attempts to display it.
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName}"`
    );
    
    // Pipe the file stream to the response.
    response.data.pipe(res);
  } catch (error) {
    console.error("Error fetching file:", error);
    res.status(500).send("Failed to fetch file.");
  }
});


app.post("/api/updateEncryptionAlgorithm", async (req, res) => {
  try {
    const { algorithm } = req.body

    if (!["fast", "balanced", "secure"].includes(algorithm)) {
      return res.status(400).json({ error: "Invalid algorithm selected" })
    }

    currentEncryptionAlgorithm = algorithm
    console.log(`Updated encryption algorithm to: ${algorithm}`)

    res.json({ message: "Encryption algorithm updated successfully" })
  } catch (error) {
    console.error("Error updating encryption algorithm:", error)
    res.status(500).json({ error: "Failed to update encryption algorithm" })
  }
})

async function refreshTokenIfNeeded() {
  try {
    if (tokens && oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      tokens = credentials
      fs.writeFileSync(path.join(__dirname, "tokens.json"), JSON.stringify(credentials))
      console.log("Access token refreshed and saved")
    }
  } catch (error) {
    console.error("Error refreshing token:", error)
    tokens = null
    fs.unlinkSync(path.join(__dirname, "tokens.json"))
  }
}

const ENCRYPTION_ALGORITHMS = {
  fast: {
    algorithm: "aes-128-cbc",
    keyLength: 16,
    pbkdf2Iterations: 50000,
    ivLength: 16
  },
  balanced: {
    algorithm: "aes-256-cbc",
    keyLength: 32,
    pbkdf2Iterations: 100000,
    ivLength: 16
  },
  secure: {
    algorithm: "aes-256-gcm",
    keyLength: 32,
    pbkdf2Iterations: 200000,
    ivLength: 12 //GCM uses 12-byte IV
  }
};

let currentEncryptionAlgorithm = "balanced"; // Default to balanced

async function encryptFile(buffer, algorithm = currentEncryptionAlgorithm) {
  const { kek } = await retrieveKEK()
  if (!kek) throw new Error("Encryption key not found")

  const salt = crypto.randomBytes(16)
  const { keyLength, pbkdf2Iterations, algorithm: cryptoAlgorithm, ivLength } = ENCRYPTION_ALGORITHMS[algorithm]
  const iv = crypto.randomBytes(ivLength)

  const key = await deriveKey(kek, salt, pbkdf2Iterations, keyLength)

  let cipher, encrypted
  if (cryptoAlgorithm === "aes-256-gcm") {
    cipher = crypto.createCipheriv(cryptoAlgorithm, key, iv)
    encrypted = Buffer.concat([cipher.update(buffer), cipher.final(), cipher.getAuthTag()])
  } else {
    cipher = crypto.createCipheriv(cryptoAlgorithm, key, iv)
    encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  }

  // Store algorithm information
  const algorithmBuffer = Buffer.from(algorithm)
  const algorithmLength = Buffer.alloc(1)
  algorithmLength.writeUInt8(algorithmBuffer.length)

  return Buffer.concat([salt, algorithmLength, algorithmBuffer, iv, encrypted])
}

async function decryptFile(buffer) {
  console.log("Starting decryption process")
  console.log("Buffer length:", buffer.length)

  const { kek } = await retrieveKEK()
  if (!kek) throw new Error("Decryption key not found")

  const salt = buffer.slice(0, 16)
  console.log("Salt:", salt.toString("hex"))

  const algorithmLength = buffer.readUInt8(16)
  console.log("Algorithm length:", algorithmLength)

  const algorithm = buffer.slice(17, 17 + algorithmLength).toString()
  console.log("Algorithm:", algorithm)

  if (!ENCRYPTION_ALGORITHMS[algorithm]) {
    throw new Error(`Unsupported algorithm: ${algorithm}`)
  }

  const { keyLength, pbkdf2Iterations, algorithm: cryptoAlgorithm, ivLength } = ENCRYPTION_ALGORITHMS[algorithm]
  const iv = buffer.slice(17 + algorithmLength, 17 + algorithmLength + ivLength)
  console.log("IV:", iv.toString("hex"))

  let encryptedData = buffer.slice(17 + algorithmLength + ivLength)
  console.log("Encrypted data length:", encryptedData.length)

  const key = await deriveKey(kek, salt, pbkdf2Iterations, keyLength)

  let decipher, decrypted
  if (cryptoAlgorithm === "aes-256-gcm") {
    const authTag = encryptedData.slice(-16)
    encryptedData = encryptedData.slice(0, -16)
    decipher = crypto.createDecipheriv(cryptoAlgorithm, key, iv)
    decipher.setAuthTag(authTag)
    decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])
  } else {
    decipher = crypto.createDecipheriv(cryptoAlgorithm, key, iv)
    decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])
  }

  console.log("Decryption successful")
  return decrypted
}

async function deriveKey(passwordHash, salt, pbkdf2Iterations, keyLength) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passwordHash, salt, pbkdf2Iterations, keyLength, "sha256", (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

function getEncryptedPasswordFromRegistry() {
  return new Promise((resolve, reject) => {
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: "\\Software\\GoogleDriveClient",
    });
    regKey.get("EncryptedPassword", (err, item) => {
      if (err) {
        if (err.code === 1 || err.code === 2) {
          console.log("No encrypted password found in registry");
          return resolve(null);
        }
        console.error("Error reading from registry:", err);
        return reject(err);
      }
      if (!item || !item.value) {
        console.log("Encrypted password is empty in registry");
        return resolve(null);
      }
      // Convert the REG_BINARY hex string back into a JSON string
      const hexString = item.value.toString();
      const buffer = Buffer.from(hexString, "hex");
      let parsed;
      try {
        parsed = JSON.parse(buffer.toString());
      } catch (e) {
        return reject(new Error("Failed to parse encrypted password JSON"));
      }
      resolve(parsed);
    });
  });
}

// async function setPasswordHashInRegistry(hash) {
//   return new Promise((resolve, reject) => {
//     const regKey = new Registry({
//       hive: Registry.HKCU,
//       key: "\\Software\\GoogleDriveClient",
//     })
//     regKey.set("PasswordHash", Registry.REG_SZ, hash, (err) => {
//       if (err) {
//         console.error("Error writing to registry:", err)
//         return reject(err)
//       }
//       resolve()
//     })
//   })
// }

app.post("/api/skipEncryption", (req, res) => {
  console.log("Received request to skip encryption")
  try {
    ensureUserPreferencesFile()
    const preferences = { encryptionEnabled: false }
    fs.writeFileSync(USER_PREFERENCES_FILE, JSON.stringify(preferences))
    console.log("Encryption skipped successfully")
    res.json({ message: "Encryption skipped successfully" })
  } catch (error) {
    console.error("Error skipping encryption:", error)
    res.status(500).json({ error: "Failed to skip encryption" })
  }
})

// Recover Password
app.post("/api/recoverPassword", async (req, res) => {
  const { mnemonic } = req.body;
  if (!mnemonic) {
    return res.status(400).json({ error: "Recovery phrase is required." });
  }
  try {
    const password = await recoverPassword(mnemonic);
    res.json({ password });
  } catch (error) {
    console.error("Error recovering password:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/checkRecovery", async (req, res) => {
  try {
    const exists = await recoveryDataExists();
    res.json({ exists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to set up recovery data (generate and store the recovery seed phrase)
app.post("/api/setupRecovery", async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  try {
    const mnemonic = await generateAndStorePasswordRecovery(password);
    res.json({ mnemonic });
  } catch (error) {
    console.error("Error setting up recovery:". error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/changePassword", async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: "New passwords do not match" });
  }
  
  try {
    const storedEncryptedPassword = await getEncryptedPasswordFromRegistry();
    if (!storedEncryptedPassword) {
      return res.status(400).json({ error: "No password has been set" });
    }
    
    // Retrieve the KEK and decrypt the stored password
    const { kek } = await retrieveKEK();
    const decryptedStoredPassword = decryptData(storedEncryptedPassword, kek);
    
    if (currentPassword !== decryptedStoredPassword) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    
    // Encrypt the new password
    const newEncryptedPassword = encryptData(newPassword, kek);
    
    // Update the registry with the new encrypted password
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: "\\Software\\GoogleDriveClient",
    });
    
    await new Promise((resolve, reject) => {
      const hexValue = Buffer.from(JSON.stringify(newEncryptedPassword)).toString("hex");
      regKey.set("EncryptedPassword", Registry.REG_BINARY, hexValue, (err) => {
        if (err) {
          console.error("Error updating registry:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Optionally, you can also update the mnemonic encryption here if needed.
    
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password", details: error.message });
  }
});


app.post("/shareFile", async (req, res) => {
  const { fileId, email, role, shareType } = req.body; // shareType: "user" or "anyone"
  try {
    if (shareType === "user") {
      //Extract domain from email
      const parts = email.split('@');
      if (parts.length !== 2) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format."
        });
      }
      const domain = parts[1];

      //check if domain has MX records
      await new Promise((resolve, reject) => {
        dns.resolveMx(domain, (err, addresses) => {
          if (err || !addresses || addresses.length === 0) {
            return reject(new Error("The email domain does not appear to exist."));
          }
          resolve();
        });
      });
    }
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    let permission;
    if (shareType === "anyone") {
      // Public sharing (anyone with the link)
      permission = {
        type: "anyone",
        role: role || "reader"
      };
    } else {
      permission = {
        type: "user",
        role: role || "reader",
        emailAddress: email
      };
    }
    
    const response = await drive.permissions.create({
      fileId,
      requestBody: permission,
      fields: "id"
    });

    let publicUrl = null;
    if (shareType === "anyone") {
      const fileResponse = await drive.files.get({
        fileId,
        fields: "webViewLink"
      });
      publicUrl = fileResponse.data.webViewLink;
    }
    
    res.json({ success: true, permissionId: response.data.id, publicUrl });
  } catch (error) {
    console.error("Error sharing file:", error);
    res.status(400).json({
      success: false,
      message: error.message || "File not shared because the email ID provided does not exist."
    });
  }
});

app.get("/securityScore", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    let allFiles = [];
    let pageToken = null;

    // List all non-trashed files
    do {
      const response = await drive.files.list({
        q: "trashed = false",
        fields: "nextPageToken, files(id, properties)",
        pageSize: 1000,
        pageToken: pageToken || undefined,
      });
      allFiles = allFiles.concat(response.data.files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const totalCount = allFiles.length;
    const encryptedCount = allFiles.filter(
      file => file.properties && file.properties.encrypted === "true"
    ).length;

    // Compute the security score as a percentage
    let score = totalCount > 0 ? Math.round((encryptedCount / totalCount) * 100) : 100;

    // Determine message based on score range
    let message = "";
    if (score < 50) {
      message = "Your drive security is low. Consider encrypting your files.";
    } else if (score < 80) {
      message = "Your drive security is moderate. Keep it up!";
    } else {
      message = "Excellent drive security! Your files are well protected.";
    }

    res.json({ score, message, totalFiles: totalCount, encryptedFiles: encryptedCount });
  } catch (error) {
    console.error("Error calculating security score:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/driveStorageStats", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const aboutResponse = await drive.about.get({ fields: "storageQuota" });
    res.json(aboutResponse.data.storageQuota);
  } catch (error) {
    console.error("Error fetching drive storage stats:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/fileTypeStats", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    let allFiles = [];
    let pageToken = null;
    do {
      const response = await drive.files.list({
        q: "trashed = false",
        fields: "nextPageToken, files(mimeType)",
        pageSize: 1000,
        pageToken: pageToken || undefined,
      });
      allFiles = allFiles.concat(response.data.files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // Aggregate counts into categories
    const stats = { Images: 0, PDFs: 0, "Office Docs": 0, Others: 0 };
    allFiles.forEach(file => {
      const mime = file.mimeType;
      if (mime.startsWith("image/")) {
        stats.Images++;
      } else if (mime === "application/pdf") {
        stats.PDFs++;
      } else if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword" ||
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel" ||
        mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        mime === "application/vnd.ms-powerpoint"
      ) {
        stats["Office Docs"]++;
      } else {
        stats.Others++;
      }
    });
    res.json(stats);
  } catch (error) {
    console.error("Error fetching file type stats:", error);
    res.status(500).json({ error: error.message });
  }
});

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error("Invalid JWT token");
  }
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(jsonPayload);
}

app.get("/countSharedFiles", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    // List all files owned by the current user using 'me' in owners
    const query = "'me' in owners";
    let allFiles = [];
    let pageToken = null;

    do {
      const response = await drive.files.list({
        q: query,
        spaces: 'drive',
        fields: "nextPageToken, files(id, shared)",
        pageSize: 1000,
        pageToken: pageToken || undefined,
      });
      allFiles = allFiles.concat(response.data.files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // Filter for shared files
    const sharedFiles = allFiles.filter(file => file.shared === true);
    res.json({ count: sharedFiles.length });
  } catch (error) {
    console.error("Error counting shared files:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/uniqueCollaborators", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const query = "'me' in owners";
    let allFiles = [];
    let pageToken = null;

    do {
      const response = await drive.files.list({
        q: query,
        spaces: 'drive',
        fields: "nextPageToken, files(id)",
        pageSize: 1000,
        pageToken: pageToken || undefined,
      });
      allFiles = allFiles.concat(response.data.files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const permissionPromises = allFiles.map(file =>
      drive.permissions.list({
        fileId: file.id,
        fields: "permissions(emailAddress, type, role)"
      }).then(resp => resp.data.permissions || [])
      .catch(err => {
        console.error(`Error fetching permissions for file ${file.id}:`, err);
        return [];
      })
    );
    const allPermissionsArrays = await Promise.all(permissionPromises);
    const collaboratorsSet = new Set();

    allPermissionsArrays.forEach(permission => {
      permission.forEach(permission => {
        if (permission.type === 'user' && permission.role !== 'owner' && permission.emailAddress) {
          collaboratorsSet.add(permission.emailAddress);
        }
      })
    })

    res.json({ count: collaboratorsSet.size });
  } catch (error) {
    console.error("Error counting unique collaborators:", error);
    res.status(500).json({ error: error.message });
  }
});

// Returns an array of the top 5 collaborators (email and number of files shared)
app.get("/topCollaborators", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const query = "'me' in owners"; // List all files owned by the current user
    let allFiles = [];
    let pageToken = null;

    do {
      const response = await drive.files.list({
        q: query,
        spaces: 'drive',
        fields: "nextPageToken, files(id)",
        pageSize: 1000,
        pageToken: pageToken || undefined,
      });
      allFiles = allFiles.concat(response.data.files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // For each file, retrieve its permissions concurrently
    const permissionPromises = allFiles.map(file =>
      drive.permissions.list({
        fileId: file.id,
        fields: "permissions(emailAddress, type, role)"
      })
      .then(resp => resp.data.permissions || [])
      .catch(err => {
        console.error(`Error fetching permissions for file ${file.id}:`, err);
        return [];
      })
    );
    const allPermissionsArrays = await Promise.all(permissionPromises);
    const collaboratorsCount = {};

    // Aggregate counts for each collaborator (non-owner user)
    allPermissionsArrays.forEach(permissionsArray => {
      permissionsArray.forEach(permission => {
        if (permission.type === 'user' && permission.role !== 'owner' && permission.emailAddress) {
          collaboratorsCount[permission.emailAddress] = (collaboratorsCount[permission.emailAddress] || 0) + 1;
        }
      });
    });

    // Sort the collaborators by count descending and take the top 5
    const topCollaborators = Object.keys(collaboratorsCount)
      .map(email => ({ email, filesShared: collaboratorsCount[email] }))
      .sort((a, b) => b.filesShared - a.filesShared)
      .slice(0, 5);

    res.json(topCollaborators);
  } catch (error) {
    console.error("Error fetching top collaborators:", error);
    res.status(500).json({ error: error.message });
  }
});

// Returns the 10 most recently added files
// app.get("/recentFiles", async (req, res) => {
//   try {
//     const drive = google.drive({ version: "v3", auth: oauth2Client });
//     const response = await drive.files.list({
//       q: "trashed = false",
//       orderBy: "createdTime desc",
//       fields: "files(id, name, createdTime)",
//       pageSize: 10
//     });
//     res.json(response.data.files);
//   } catch (error) {
//     console.error("Error fetching recent files:", error);
//     res.status(500).json({ error: error.message });
//   }
// });


app.get("/recentFiles", async (req, res) => {
  try {
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.list({
          q: "trashed = false",
          orderBy: "modifiedTime desc",
          fields: "files(id, name, createdTime, modifiedTime, size)",
          pageSize: 10
      });
      res.json(response.data.files);
  } catch (error) {
      console.error("Error fetching recent files:", error);
      res.status(500).json({ error: error.message });
  }
});

// Returns simulated storage trend data for the past 7 days.
app.get("/storageTrend", async (req, res) => {
  try {
    const dates = [];
    const usage = [];
    // Return data for the past 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString());
      // Simulate usage between 10 and 20 GB (for demo purposes)
      usage.push((Math.random() * 10 + 10).toFixed(2));
    }
    res.json({ dates, usage });
  } catch (error) {
    console.error("Error fetching storage trend:", error);
    res.status(500).json({ error: error.message });
  }
});

function ensureFile(filePath, defaultContent) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultContent))
    console.log(`Created file: ${filePath}`)
  }
}

function isEncryptionEnabled() {
  try {
    const data = fs.readFileSync(USER_PREFERENCES_FILE, "utf8")
    const preferences = JSON.parse(data)
    return preferences.encryptionEnabled
  } catch (error) {
    console.error("Error reading user preferences:", error)
    return false
  }
}

function ensureUserPreferencesFile() {
  ensureFile(USER_PREFERENCES_FILE, { encryptionEnabled: false })
}

async function isPasswordSet() {
  try {
    const storedEncryptedPassword = await getEncryptedPasswordFromRegistry()
    return storedEncryptedPassword !== null
  } catch (error) {
    console.error("Error checking if password is set:", error)
    return false
  }
}

app.use(async (req, res, next) => {
  await refreshTokenIfNeeded()
  next()
})

app.use((req, res) => {
  console.log(`No route found for ${req.method} ${req.url}`)
  res.status(404).json({ error: "Not Found" })
})

app.use((req, res, next) => {
  console.log(`Received ${req.method} request for ${req.url}`)
  next()
})

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} request to ${req.url}`)
  next()
})

ensureUserPreferencesFile()

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})