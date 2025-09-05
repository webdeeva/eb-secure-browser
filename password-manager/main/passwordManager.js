/**
 * Main Password Manager for Everything Black Browser
 * Coordinates encryption, database, and password operations
 */

const PasswordEncryption = require('./encryption');
const PasswordDatabase = require('./database');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');

class PasswordManager {
    constructor() {
        this.encryption = new PasswordEncryption();
        this.database = null;
        this.isLocked = true;
        this.autoLockTimer = null;
        this.autoLockDelay = 15 * 60 * 1000; // 15 minutes
        this.initializeIPCHandlers();
    }

    /**
     * Initialize the password manager
     */
    async initialize() {
        console.log('[PasswordManager] Initializing...');
        this.database = new PasswordDatabase().initialize();
        return this;
    }

    /**
     * Set up IPC handlers for renderer communication
     */
    initializeIPCHandlers() {
        // Master password operations
        ipcMain.handle('pm-has-master-password', () => {
            return this.hasMasterPassword();
        });

        ipcMain.handle('pm-setup-master-password', async (event, masterPassword) => {
            return this.setupMasterPassword(masterPassword);
        });

        ipcMain.handle('pm-unlock', async (event, masterPassword) => {
            return this.unlock(masterPassword);
        });

        ipcMain.handle('pm-lock', () => {
            return this.lock();
        });

        ipcMain.handle('pm-is-locked', () => {
            return this.isLocked;
        });

        // Password operations
        ipcMain.handle('pm-add-password', async (event, passwordData) => {
            return this.addPassword(passwordData);
        });

        ipcMain.handle('pm-get-passwords', async (event, domain) => {
            return this.getPasswords(domain);
        });

        ipcMain.handle('pm-get-password', async (event, id) => {
            return this.getPassword(id);
        });

        ipcMain.handle('pm-update-password', async (event, id, passwordData) => {
            return this.updatePassword(id, passwordData);
        });

        ipcMain.handle('pm-delete-password', async (event, id) => {
            return this.deletePassword(id);
        });

        ipcMain.handle('pm-search-passwords', async (event, query) => {
            return this.searchPasswords(query);
        });

        // Password generation and strength
        ipcMain.handle('pm-generate-password', async (event, options) => {
            return this.generatePassword(options);
        });

        ipcMain.handle('pm-check-strength', async (event, password) => {
            return this.checkPasswordStrength(password);
        });

        // Notes operations
        ipcMain.handle('pm-add-note', async (event, noteData) => {
            return this.addSecureNote(noteData);
        });

        ipcMain.handle('pm-get-notes', async () => {
            return this.getSecureNotes();
        });

        ipcMain.handle('pm-delete-note', async (event, id) => {
            return this.deleteSecureNote(id);
        });

        // Statistics and management
        ipcMain.handle('pm-get-statistics', async () => {
            return this.getStatistics();
        });

        ipcMain.handle('pm-export-data', async () => {
            return this.exportData();
        });

        ipcMain.handle('pm-import-data', async (event, data) => {
            return this.importData(data);
        });

        ipcMain.handle('pm-find-duplicates', async () => {
            return this.findDuplicatePasswords();
        });

        ipcMain.handle('pm-get-tags', async () => {
            return this.getAllTags();
        });
    }

    /**
     * Check if master password has been set up
     */
    hasMasterPassword() {
        return this.database.hasMasterPassword();
    }

    /**
     * Set up the master password for first time
     */
    async setupMasterPassword(masterPassword) {
        try {
            // Validate password strength
            const strength = this.encryption.checkPasswordStrength(masterPassword);
            if (strength.score < 3) {
                return {
                    success: false,
                    error: 'Password is too weak. Please use a stronger password.',
                    strength
                };
            }

            // Initialize encryption with new master password
            const settings = this.encryption.initialize(masterPassword);
            
            // Save to database
            this.database.saveMasterPasswordSettings(
                settings.salt,
                settings.verificationHash,
                settings.iterations
            );

            this.isLocked = false;
            this.resetAutoLockTimer();

            return {
                success: true,
                message: 'Master password set successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Setup error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Unlock the password manager with master password
     */
    async unlock(masterPassword) {
        try {
            const settings = this.database.getMasterPasswordSettings();
            
            if (!settings) {
                return {
                    success: false,
                    error: 'No master password set'
                };
            }

            const isValid = this.encryption.verifyMasterPassword(
                masterPassword,
                settings.salt,
                settings.verification_hash
            );

            if (isValid) {
                this.isLocked = false;
                this.database.updateLastAccessed();
                this.resetAutoLockTimer();
                
                return {
                    success: true,
                    message: 'Password manager unlocked'
                };
            } else {
                return {
                    success: false,
                    error: 'Incorrect master password'
                };
            }
        } catch (error) {
            console.error('[PasswordManager] Unlock error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Lock the password manager
     */
    lock() {
        this.encryption.lock();
        this.isLocked = true;
        this.clearAutoLockTimer();
        
        return {
            success: true,
            message: 'Password manager locked'
        };
    }

    /**
     * Reset auto-lock timer
     */
    resetAutoLockTimer() {
        this.clearAutoLockTimer();
        this.autoLockTimer = setTimeout(() => {
            this.lock();
        }, this.autoLockDelay);
    }

    /**
     * Clear auto-lock timer
     */
    clearAutoLockTimer() {
        if (this.autoLockTimer) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
        }
    }

    /**
     * Add a new password entry
     */
    async addPassword(passwordData) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            // Generate ID if not provided
            passwordData.id = passwordData.id || uuidv4();
            
            // Encrypt the password entry
            const encrypted = this.encryption.encryptPasswordEntry(passwordData);
            
            // Save to database
            const id = this.database.savePassword(encrypted);
            
            return {
                success: true,
                id,
                message: 'Password saved successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Add password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all passwords or filter by domain
     */
    async getPasswords(domain = null) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const encrypted = this.database.getPasswords(domain);
            const decrypted = encrypted.map(entry => {
                try {
                    return this.encryption.decryptPasswordEntry(entry);
                } catch (e) {
                    console.error('Failed to decrypt entry:', entry.id);
                    return null;
                }
            }).filter(entry => entry !== null);
            
            return {
                success: true,
                passwords: decrypted
            };
        } catch (error) {
            console.error('[PasswordManager] Get passwords error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get a single password by ID
     */
    async getPassword(id) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const encrypted = this.database.getPassword(id);
            if (!encrypted) {
                return { success: false, error: 'Password not found' };
            }
            
            const decrypted = this.encryption.decryptPasswordEntry(encrypted);
            
            // Update usage statistics
            this.database.updatePasswordUsage(id);
            
            return {
                success: true,
                password: decrypted
            };
        } catch (error) {
            console.error('[PasswordManager] Get password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update an existing password
     */
    async updatePassword(id, passwordData) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            // Get existing entry
            const existing = this.database.getPassword(id);
            if (!existing) {
                return { success: false, error: 'Password not found' };
            }
            
            // Save old password to history
            if (passwordData.password && existing.encrypted_password) {
                this.database.addToPasswordHistory(id, existing.encrypted_password);
            }
            
            // Merge with existing data
            passwordData.id = id;
            
            // Encrypt and save
            const encrypted = this.encryption.encryptPasswordEntry(passwordData);
            this.database.savePassword(encrypted);
            
            return {
                success: true,
                message: 'Password updated successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Update password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete a password entry
     */
    async deletePassword(id) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            this.database.deletePassword(id);
            
            return {
                success: true,
                message: 'Password deleted successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Delete password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Search passwords by query
     */
    async searchPasswords(query) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const encrypted = this.database.searchPasswords(query);
            const decrypted = encrypted.map(entry => {
                try {
                    return this.encryption.decryptPasswordEntry(entry);
                } catch (e) {
                    return null;
                }
            }).filter(entry => entry !== null);
            
            return {
                success: true,
                passwords: decrypted
            };
        } catch (error) {
            console.error('[PasswordManager] Search error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate a secure password
     */
    generatePassword(options) {
        try {
            const password = this.encryption.generatePassword(options);
            const strength = this.encryption.checkPasswordStrength(password);
            
            return {
                success: true,
                password,
                strength
            };
        } catch (error) {
            console.error('[PasswordManager] Generate password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check password strength
     */
    checkPasswordStrength(password) {
        try {
            const strength = this.encryption.checkPasswordStrength(password);
            return {
                success: true,
                strength
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add a secure note
     */
    async addSecureNote(noteData) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            noteData.id = noteData.id || uuidv4();
            noteData.encrypted_content = this.encryption.encrypt(noteData.content);
            
            const id = this.database.saveSecureNote(noteData);
            
            return {
                success: true,
                id,
                message: 'Note saved successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Add note error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all secure notes
     */
    async getSecureNotes() {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const encrypted = this.database.getSecureNotes();
            const decrypted = encrypted.map(note => ({
                ...note,
                content: this.encryption.decrypt(note.encrypted_content)
            }));
            
            return {
                success: true,
                notes: decrypted
            };
        } catch (error) {
            console.error('[PasswordManager] Get notes error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete a secure note
     */
    async deleteSecureNote(id) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            this.database.deleteSecureNote(id);
            
            return {
                success: true,
                message: 'Note deleted successfully'
            };
        } catch (error) {
            console.error('[PasswordManager] Delete note error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get statistics
     */
    async getStatistics() {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const stats = this.database.getStatistics();
            
            return {
                success: true,
                statistics: stats
            };
        } catch (error) {
            console.error('[PasswordManager] Get statistics error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find duplicate passwords
     */
    async findDuplicatePasswords() {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const duplicates = this.database.findDuplicatePasswords();
            
            // Decrypt the duplicate groups
            const decrypted = duplicates.map(group => {
                return group.map(entry => {
                    try {
                        return this.encryption.decryptPasswordEntry(entry);
                    } catch (e) {
                        return null;
                    }
                }).filter(entry => entry !== null);
            });
            
            return {
                success: true,
                duplicates: decrypted
            };
        } catch (error) {
            console.error('[PasswordManager] Find duplicates error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all tags
     */
    async getAllTags() {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const tags = this.database.getAllTags();
            
            return {
                success: true,
                tags
            };
        } catch (error) {
            console.error('[PasswordManager] Get tags error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Export all data (encrypted)
     */
    async exportData() {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const data = this.database.exportData();
            
            return {
                success: true,
                data
            };
        } catch (error) {
            console.error('[PasswordManager] Export error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Import data
     */
    async importData(data) {
        if (this.isLocked) {
            return { success: false, error: 'Password manager is locked' };
        }

        try {
            this.resetAutoLockTimer();
            
            const result = this.database.importData(data);
            
            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('[PasswordManager] Import error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.clearAutoLockTimer();
        this.encryption.lock();
        if (this.database) {
            this.database.close();
        }
    }
}

module.exports = PasswordManager;