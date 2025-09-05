/**
 * Preload script for Password Manager
 * Exposes secure IPC channels to the renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose password manager API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    passwordManager: {
        // Master password operations
        hasMasterPassword: () => ipcRenderer.invoke('pm-has-master-password'),
        setupMasterPassword: (password) => ipcRenderer.invoke('pm-setup-master-password', password),
        unlock: (password) => ipcRenderer.invoke('pm-unlock', password),
        lock: () => ipcRenderer.invoke('pm-lock'),
        isLocked: () => ipcRenderer.invoke('pm-is-locked'),
        
        // Password CRUD operations
        addPassword: (passwordData) => ipcRenderer.invoke('pm-add-password', passwordData),
        getPasswords: (domain) => ipcRenderer.invoke('pm-get-passwords', domain),
        getPassword: (id) => ipcRenderer.invoke('pm-get-password', id),
        updatePassword: (id, passwordData) => ipcRenderer.invoke('pm-update-password', id, passwordData),
        deletePassword: (id) => ipcRenderer.invoke('pm-delete-password', id),
        searchPasswords: (query) => ipcRenderer.invoke('pm-search-passwords', query),
        
        // Password utilities
        generatePassword: (options) => ipcRenderer.invoke('pm-generate-password', options),
        checkStrength: (password) => ipcRenderer.invoke('pm-check-strength', password),
        
        // Secure notes
        addNote: (noteData) => ipcRenderer.invoke('pm-add-note', noteData),
        getNotes: () => ipcRenderer.invoke('pm-get-notes'),
        deleteNote: (id) => ipcRenderer.invoke('pm-delete-note', id),
        
        // Statistics and management
        getStatistics: () => ipcRenderer.invoke('pm-get-statistics'),
        exportData: () => ipcRenderer.invoke('pm-export-data'),
        importData: (data) => ipcRenderer.invoke('pm-import-data', data),
        findDuplicates: () => ipcRenderer.invoke('pm-find-duplicates'),
        getTags: () => ipcRenderer.invoke('pm-get-tags')
    },
    
    // Event listeners
    onPasswordManagerLocked: (callback) => {
        ipcRenderer.on('pm-locked', callback);
    },
    
    // Remove listeners
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('pm-locked');
    }
});