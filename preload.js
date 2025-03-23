const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  generateAndStoreKEK: () => ipcRenderer.invoke("generate-and-store-kek"),
  retrieveKEK: () => ipcRenderer.invoke("retrieve-kek"),
  encryptData: (data, kek) => ipcRenderer.invoke("encrypt-data", { data, kek }),
  decryptData: (encryptedData, kek) => ipcRenderer.invoke("decrypt-data", { encryptedData, kek }),
})

