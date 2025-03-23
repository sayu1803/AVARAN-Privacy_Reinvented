import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import isDev from 'electron-is-dev';
import { generateAndStoreKEK, retrieveKEK, encryptData, decryptData } from "./frontend/scripts/keyManagement.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server;
let mainWindow;

function startServer() {
    return new Promise((resolve, reject) => {
        console.log("Starting the server ...");
        const indexPath = path.join(__dirname, "index.js");
        server = spawn('node', [indexPath], {
            stdio: 'inherit',
            shell: true,
        });

        server.on('error', (error) => {
            console.error('Failed to start the server:', error);
            reject(error);
        });

        server.on('close', (code) => {
            console.log(`Server exited with code ${code}`);
            if (code !== 0) reject(new Error(`Server exited with code ${code}`));
        });

        resolve();
    });
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const mainWindow = new BrowserWindow({
        width: width,
        height: height,
        icon: path.join(__dirname, './frontend/assets/snowden-icon.ico'), // Set your custom app icon here
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const startURL = isDev
        ? 'http://localhost:8000/login.html'
        : `file://${path.join(__dirname, 'frontend/login.html')}`;

    mainWindow.loadURL(startURL);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Check if the user's display supports full-screen mode
    if (screen.getAllDisplays().some(display => display.size.width === width && display.size.height === height)) {
        mainWindow.setFullScreen(false);
    }

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

// IPC handlers for key management operations
ipcMain.handle("generate-and-store-kek", async () => {
    try {
      await generateAndStoreKEK()
      return { success: true }
    } catch (error) {
      console.error("Error generating and storing KEK:", error)
      return { success: false, error: error.message }
    }
})
  
ipcMain.handle("retrieve-kek", async () => {
    try {
      const { kek, salt } = await retrieveKEK()
      return { success: true, kek, salt }
    } catch (error) {
      console.error("Error retrieving KEK:", error)
      return { success: false, error: error.message }
    }
})
  
ipcMain.handle("encrypt-data", async (event, { data, kek }) => {
    try {
      const encryptedData = encryptData(data, kek)
      return { success: true, encryptedData }
    } catch (error) {
      console.error("Error encrypting data:", error)
      return { success: false, error: error.message }
    }
})
  
ipcMain.handle("decrypt-data", async (event, { encryptedData, kek }) => {
    try {
      const decryptedData = decryptData(encryptedData, kek)
      return { success: true, decryptedData }
    } catch (error) {
      console.error("Error decrypting data:", error)
      return { success: false, error: error.message }
    }
})

app.whenReady().then(async () => {
    app.commandLine.appendSwitch('disable-autofill');
    
    try {
        await startServer();  // Start the server
        setTimeout(createWindow, 2000);  // Wait 2 seconds for the server to fully start before loading the Electron window
    } catch (error) {
        console.error('Failed to start the server:', error);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (server) server.kill('SIGTERM');
});
