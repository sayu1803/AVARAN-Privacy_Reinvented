// passwordRecovery.js
import bip39 from 'bip39';
import crypto from 'crypto';
import Registry from 'winreg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Use the specified registry path

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registryPath = '\\Software\\GoogleDriveClient\\PasswordRecovery';

/**
 * Create the registry key if it does not exist.
 * Returns a Promise that resolves when the key is ready.
 */
function ensureRegistryKey() {
  return new Promise((resolve, reject) => {
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: registryPath,
    });
    regKey.keyExists((err, exists) => {
      if (err) return reject(err);
      if (!exists) {
        regKey.create((createErr) => {
          if (createErr) return reject(createErr);
          resolve(regKey);
        });
      } else {
        resolve(regKey);
      }
    });
  });
}

/**
 * Store recovery data (encrypted password and salt) in the registry
 * under the value name "RecoveryData".
 */
async function storeRecoveryData(encryptedPassword, salt) {
  const regKey = await ensureRegistryKey();
  // Create an object with both values
  const recoveryData = {
    encryptedPassword, // { iv: "...", data: "..." }
    salt: salt.toString('hex'),
  };
  // Convert to string and then to hex (for safe storage)
  const recoveryDataHex = Buffer.from(JSON.stringify(recoveryData)).toString('hex');
  regKey.set('RecoveryPassword', Registry.REG_SZ, recoveryDataHex, (err) => {
    if (err) {
      console.error('Error writing RecoveryData to registry:', err);
    }
  });
}

/**
 * Encrypts the given seed phrase using your public key.
 * The public key is assumed to be in the project root as "public.pem".
 *
 * @param {string} seedPhrase - The mnemonic seed phrase.
 * @returns {string} - The encrypted seed phrase (Base64 encoded).
 */
export function encryptSeedPhrase(seedPhrase) {
  const publicKeyPath = path.join(__dirname, '../../public.pem');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  const encryptedBuffer = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(seedPhrase, 'utf8')
  );
  return encryptedBuffer.toString('base64');
}

/**
 * Generate a mnemonic seed phrase, derive a key from it, encrypt the user's password,
 * and store the encrypted password and salt in the registry.
 *
 * @param {string} password - The user's password to encrypt.
 * @returns {Promise<string>} - Resolves with the mnemonic seed phrase.
 */
export async function generateAndStorePasswordRecovery(password) {
  // Generate a 12-word mnemonic
  const mnemonic = bip39.generateMnemonic();

  // Generate a random salt (16 bytes)
  const salt = crypto.randomBytes(16);

  // Derive a 32-byte key from the mnemonic using PBKDF2.
  const key = crypto.pbkdf2Sync(mnemonic, salt, 100000, 32, 'sha256');

  // Encrypt the password using AES-256-CBC.
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Prepare the encrypted password object with the IV.
  const encryptedPassword = { iv: iv.toString('hex'), data: encrypted };

  // Store the recovery data in the registry.
  await storeRecoveryData(encryptedPassword, salt);

  // Return the mnemonic to the caller (so the user can note it down).
  const encryptedMnemonic = encryptSeedPhrase(mnemonic);
  return encryptedMnemonic;
}

/**
 * Recover the user's password by decrypting the stored encrypted password
 * using the provided mnemonic seed phrase.
 *
 * @param {string} mnemonic - The mnemonic seed phrase provided by the user.
 * @returns {Promise<string>} - Resolves with the decrypted password.
 */
export async function recoverPassword(mnemonic) {
    try {
      const { encryptedPassword, salt } = await getRecoveryData();
      // Re-derive the key using the provided mnemonic and stored salt.
      const key = crypto.pbkdf2Sync(mnemonic, salt, 100000, 32, 'sha256');
  
      // Decrypt the password using AES-256-CBC.
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        key,
        Buffer.from(encryptedPassword.iv, 'hex')
      );
      let decrypted = decipher.update(encryptedPassword.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error(`Password recovery failed: ${error.message}`);
    }
}

// In passwordRecovery.js
export async function recoveryDataExists() {
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: registryPath,
    });
    return new Promise((resolve, reject) => {
      regKey.get('RecoveryPassword', (err, item) => {
        if (err) {
          // If the error indicates missing value, return false
          return resolve(false);
        }
        if (!item || !item.value) {
          return resolve(false);
        }
        resolve(true);
      });
    });
}

function getRecoveryData() {
    return new Promise((resolve, reject) => {
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: registryPath,
      });
      regKey.get('RecoveryPassword', (err, item) => {
        if (err) return reject(err);
        if (!item || !item.value) {
          return reject(new Error('Recovery data not found.'));
        }
        try {
          const recoveryData = JSON.parse(Buffer.from(item.value, 'hex').toString());
          // Convert the stored salt (hex) back to a Buffer.
          recoveryData.salt = Buffer.from(recoveryData.salt, 'hex');
          resolve(recoveryData);
        } catch (e) {
          reject(e);
        }
      });
    });
}
  
