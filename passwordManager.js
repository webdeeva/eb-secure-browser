const bcrypt = require('bcryptjs');
const Store = require('electron-store');
const crypto = require('crypto');
const { app } = require('electron');

class PasswordManager {
    constructor() {
        // Use a more specific store configuration to ensure persistence
        this.store = new Store({
            name: 'eb-wallet-auth',
            cwd: app.getPath('userData'), // Explicitly set the storage directory
            encryptionKey: 'eb-auth-encryption-key-v1'
        });
        
        // Session management
        this.isUnlocked = false;
        this.unlockTime = null;
        this.sessionTimeout = 15 * 60 * 1000; // 15 minutes
        this.failedAttempts = 0;
        this.maxFailedAttempts = 5;
        this.lockoutTime = null;
        this.lockoutDuration = 30 * 60 * 1000; // 30 minutes
    }

    // Check if password is set
    hasPassword() {
        const passwordHash = this.store.get('passwordHash');
        return !!passwordHash;
    }

    // Set up new password
    async setPassword(password) {
        try {
            // Validate password strength
            if (!this.validatePasswordStrength(password)) {
                throw new Error('Password does not meet requirements');
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            
            // Store hash
            this.store.set('passwordHash', hash);
            
            // Generate encryption key from password
            const encryptionKey = this.deriveKeyFromPassword(password);
            this.store.set('encryptionKey', encryptionKey);
            
            return true;
        } catch (error) {
            console.error('Error setting password:', error);
            throw error;
        }
    }

    // Verify password
    async verifyPassword(password) {
        try {
            // Check if locked out
            if (this.isLockedOut()) {
                const remainingTime = Math.ceil((this.lockoutTime + this.lockoutDuration - Date.now()) / 1000 / 60);
                throw new Error(`Too many failed attempts. Try again in ${remainingTime} minutes.`);
            }

            const hash = this.store.get('passwordHash');
            if (!hash) {
                throw new Error('No password set');
            }

            const isValid = await bcrypt.compare(password, hash);
            
            if (isValid) {
                // Reset failed attempts
                this.failedAttempts = 0;
                this.lockoutTime = null;
                
                // Set session as unlocked
                this.isUnlocked = true;
                this.unlockTime = Date.now();
                
                return true;
            } else {
                // Increment failed attempts
                this.failedAttempts++;
                
                if (this.failedAttempts >= this.maxFailedAttempts) {
                    this.lockoutTime = Date.now();
                    throw new Error(`Too many failed attempts. Wallet locked for 30 minutes.`);
                }
                
                throw new Error(`Invalid password. ${this.maxFailedAttempts - this.failedAttempts} attempts remaining.`);
            }
        } catch (error) {
            console.error('Error verifying password:', error);
            throw error;
        }
    }

    // Change password
    async changePassword(oldPassword, newPassword) {
        try {
            // Verify old password first
            const hash = this.store.get('passwordHash');
            const isValid = await bcrypt.compare(oldPassword, hash);
            
            if (!isValid) {
                throw new Error('Current password is incorrect');
            }

            // Set new password
            await this.setPassword(newPassword);
            
            return true;
        } catch (error) {
            console.error('Error changing password:', error);
            throw error;
        }
    }

    // Check if wallet is unlocked
    isWalletUnlocked() {
        // Check if session has timed out
        if (this.isUnlocked && this.unlockTime) {
            const elapsed = Date.now() - this.unlockTime;
            if (elapsed > this.sessionTimeout) {
                this.lockWallet();
                return false;
            }
        }
        
        return this.isUnlocked;
    }

    // Lock wallet
    lockWallet() {
        this.isUnlocked = false;
        this.unlockTime = null;
    }

    // Reset activity timer
    resetActivityTimer() {
        if (this.isUnlocked) {
            this.unlockTime = Date.now();
        }
    }

    // Check if locked out due to failed attempts
    isLockedOut() {
        if (this.lockoutTime) {
            const elapsed = Date.now() - this.lockoutTime;
            if (elapsed < this.lockoutDuration) {
                return true;
            } else {
                // Reset lockout
                this.lockoutTime = null;
                this.failedAttempts = 0;
                return false;
            }
        }
        return false;
    }

    // Validate password strength
    validatePasswordStrength(password) {
        // At least 8 characters
        if (password.length < 8) return false;
        
        // Contains at least one uppercase letter
        if (!/[A-Z]/.test(password)) return false;
        
        // Contains at least one lowercase letter
        if (!/[a-z]/.test(password)) return false;
        
        // Contains at least one number
        if (!/[0-9]/.test(password)) return false;
        
        // Contains at least one special character
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
        
        return true;
    }

    // Derive encryption key from password
    deriveKeyFromPassword(password) {
        // Use PBKDF2 to derive a key from the password
        const salt = 'eb-wallet-salt'; // In production, use a random salt
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        return key.toString('hex');
    }

    // Get encryption key (only if unlocked)
    getEncryptionKey() {
        if (!this.isWalletUnlocked()) {
            throw new Error('Wallet is locked');
        }
        return this.store.get('encryptionKey');
    }

    // Clear all auth data (use with caution)
    clearAuthData() {
        this.store.clear();
        this.lockWallet();
        this.failedAttempts = 0;
        this.lockoutTime = null;
    }
}

module.exports = PasswordManager;