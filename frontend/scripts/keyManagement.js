import crypto from "crypto"
import argon2 from "argon2"
//import dpapi from 'node-windows-dpapi'; // Removed invalid import
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import os from "os"

function getAppDataPath() {
  switch (process.platform) {
    case "win32":
      return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support")
    case "linux":
      return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
    default:
      return path.join(os.homedir(), ".googledriveencrypt")
  }
}

// Function to get or create a machine GUID
function getMachineGUID() {
  const guidPath = path.join(getAppDataPath(), "GoogleDriveClient", "machine_guid")

  if (fs.existsSync(guidPath)) {
    return fs.readFileSync(guidPath, "utf8")
  }

  let guid
  try {
    // Try to get the machine GUID from the Windows registry
    guid = execSync("wmic csproduct get UUID").toString().split("\n")[1].trim()
  } catch (error) {
    // If unable to get from registry, generate a new GUID
    guid = crypto.randomUUID()
  }

  // Ensure the directory exists
  fs.mkdirSync(path.dirname(guidPath), { recursive: true })

  // Save the GUID for future use
  fs.writeFileSync(guidPath, guid)

  return guid
}

// Function to generate a unique system-specific token
function generateSystemToken() {
  const machineGUID = getMachineGUID()
  return crypto.createHash("sha256").update(machineGUID).digest("hex")
}

// Function to generate a random salt
function generateSalt() {
  return crypto.randomBytes(16)
}

// Function to derive a key using Argon2
async function deriveKey(systemToken, salt) {
  const options = {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
    salt,
  }

  return argon2.hash(systemToken, options)
}

// Function to encrypt data using DPAPI -  Replaced with a placeholder.  Actual implementation would depend on chosen alternative.
function encryptWithDPAPI(data) {
  // Placeholder - Replace with actual DPAPI alternative implementation
  return data
}

// Function to decrypt data using DPAPI - Replaced with a placeholder. Actual implementation would depend on chosen alternative.
function decryptWithDPAPI(encryptedData) {
  // Placeholder - Replace with actual DPAPI alternative implementation
  return encryptedData
}

// Function to generate and store the Key Encryption Key (KEK)
export async function generateAndStoreKEK() {
  const systemToken = generateSystemToken()
  const salt = generateSalt()
  const derivedKey = await deriveKey(systemToken, salt)

  // Encrypt the derived key using DPAPI
  const encryptedKEK = encryptWithDPAPI(derivedKey)

  // Store the encrypted KEK and salt securely
  const kekPath = path.join(getAppDataPath(), "GoogleDriveClient")
  if (!fs.existsSync(kekPath)) {
    fs.mkdirSync(kekPath, { recursive: true })
  }
  fs.writeFileSync(path.join(kekPath, "encrypted_kek.bin"), encryptedKEK)
  fs.writeFileSync(path.join(kekPath, "salt.bin"), salt)
}

// Function to retrieve and decrypt the KEK
export async function retrieveKEK() {
  const kekPath = path.join(getAppDataPath(), "GoogleDriveClient")
  const encryptedKEK = fs.readFileSync(path.join(kekPath, "encrypted_kek.bin"))
  const salt = fs.readFileSync(path.join(kekPath, "salt.bin"))

  const decryptedKEK = decryptWithDPAPI(encryptedKEK)

  //Derive a 32-byte DEK using PBKDF2
  const dek = crypto.pbkdf2Sync(decryptedKEK, salt, 100000, 32, "sha256")

  return { kek: dek }
}

// Function to encrypt data using the KEK
export function encryptData(data, kek) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", kek, iv)
  let encrypted = cipher.update(data, "utf8", "hex")
  encrypted += cipher.final("hex")
  return { iv: iv.toString("hex"), encryptedData: encrypted }
}

// Function to decrypt data using the KEK
export function decryptData(encryptedData, kek) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", kek, Buffer.from(encryptedData.iv, "hex"))
  let decrypted = decipher.update(encryptedData.encryptedData, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

/**
 * Encrypts the given seed phrase using your public key.
 * @param {string} seedPhrase - The mnemonic seed phrase.
 * @returns {string} - The encrypted seed phrase (Base64 encoded).
 */
export function encryptSeedPhrase(seedPhrase) {
  // Construct the full path to public.pem (two levels up from frontend/scripts)
  const publicKeyPath = path.join(__dirname, '../../public.pem');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  
  const encryptedBuffer = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(seedPhrase, 'utf8')
  );
  return encryptedBuffer.toString('base64');
}
