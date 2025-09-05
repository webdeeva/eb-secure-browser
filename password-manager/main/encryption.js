/**
 * Encryption Module for Everything Black Password Manager
 * Uses AES-256-GCM for authenticated encryption
 * PBKDF2 for key derivation from master password
 */

const crypto = require('crypto');

class PasswordEncryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.iterations = 100000; // PBKDF2 iterations
        this.keyLength = 32; // 256 bits
        this.saltLength = 32; // 256 bits
        this.ivLength = 16; // 128 bits
        this.tagLength = 16; // 128 bits
        this.masterKey = null;
        this.salt = null;
    }

    /**
     * Generate a cryptographically secure random salt
     */
    generateSalt() {
        return crypto.randomBytes(this.saltLength);
    }

    /**
     * Generate a random IV for each encryption
     */
    generateIV() {
        return crypto.randomBytes(this.ivLength);
    }

    /**
     * Derive encryption key from master password using PBKDF2
     * @param {string} masterPassword - User's master password
     * @param {Buffer} salt - Salt for key derivation
     * @returns {Buffer} Derived key
     */
    deriveKey(masterPassword, salt) {
        return crypto.pbkdf2Sync(
            masterPassword,
            salt,
            this.iterations,
            this.keyLength,
            'sha256'
        );
    }

    /**
     * Initialize the encryption system with master password
     * @param {string} masterPassword - User's master password
     * @param {Buffer} salt - Existing salt or null for new
     * @returns {Object} Salt and verification hash
     */
    initialize(masterPassword, salt = null) {
        if (!salt) {
            salt = this.generateSalt();
        }
        
        this.salt = salt;
        this.masterKey = this.deriveKey(masterPassword, salt);
        
        // Create a verification hash to check if password is correct
        const verificationData = 'EB_PASSWORD_MANAGER_VERIFICATION';
        const encrypted = this.encrypt(verificationData);
        
        return {
            salt: salt.toString('hex'),
            verificationHash: encrypted,
            iterations: this.iterations
        };
    }

    /**
     * Verify master password is correct
     * @param {string} masterPassword - Password to verify
     * @param {string} saltHex - Stored salt in hex
     * @param {string} verificationHash - Stored verification hash
     * @returns {boolean} True if password is correct
     */
    verifyMasterPassword(masterPassword, saltHex, verificationHash) {
        try {
            const salt = Buffer.from(saltHex, 'hex');
            this.salt = salt;
            this.masterKey = this.deriveKey(masterPassword, salt);
            
            const decrypted = this.decrypt(verificationHash);
            return decrypted === 'EB_PASSWORD_MANAGER_VERIFICATION';
        } catch (error) {
            return false;
        }
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {string} plaintext - Data to encrypt
     * @returns {string} Encrypted data with IV and auth tag
     */
    encrypt(plaintext) {
        if (!this.masterKey) {
            throw new Error('Encryption not initialized. Call initialize() first.');
        }

        const iv = this.generateIV();
        const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
        
        let encrypted = cipher.update(plaintext, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const authTag = cipher.getAuthTag();
        
        // Combine IV, authTag, and encrypted data
        const combined = Buffer.concat([iv, authTag, encrypted]);
        
        return combined.toString('base64');
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @returns {string} Decrypted plaintext
     */
    decrypt(encryptedData) {
        if (!this.masterKey) {
            throw new Error('Encryption not initialized. Call initialize() first.');
        }

        const combined = Buffer.from(encryptedData, 'base64');
        
        // Extract IV, authTag, and encrypted data
        const iv = combined.slice(0, this.ivLength);
        const authTag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
        const encrypted = combined.slice(this.ivLength + this.tagLength);
        
        const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString('utf8');
    }

    /**
     * Encrypt a password entry
     * @param {Object} passwordEntry - Password data to encrypt
     * @returns {Object} Encrypted entry
     */
    encryptPasswordEntry(passwordEntry) {
        const encrypted = {
            id: passwordEntry.id,
            domain: passwordEntry.domain,
            username: passwordEntry.username,
            favicon: passwordEntry.favicon,
            tags: passwordEntry.tags,
            created_at: passwordEntry.created_at,
            modified_at: new Date().toISOString()
        };

        // Encrypt sensitive fields
        if (passwordEntry.password) {
            encrypted.encrypted_password = this.encrypt(passwordEntry.password);
        }
        if (passwordEntry.notes) {
            encrypted.encrypted_notes = this.encrypt(passwordEntry.notes);
        }

        return encrypted;
    }

    /**
     * Decrypt a password entry
     * @param {Object} encryptedEntry - Encrypted password data
     * @returns {Object} Decrypted entry
     */
    decryptPasswordEntry(encryptedEntry) {
        const decrypted = {
            id: encryptedEntry.id,
            domain: encryptedEntry.domain,
            username: encryptedEntry.username,
            favicon: encryptedEntry.favicon,
            tags: encryptedEntry.tags,
            created_at: encryptedEntry.created_at,
            modified_at: encryptedEntry.modified_at,
            last_used: encryptedEntry.last_used,
            use_count: encryptedEntry.use_count
        };

        // Decrypt sensitive fields
        if (encryptedEntry.encrypted_password) {
            decrypted.password = this.decrypt(encryptedEntry.encrypted_password);
        }
        if (encryptedEntry.encrypted_notes) {
            decrypted.notes = this.decrypt(encryptedEntry.encrypted_notes);
        }

        return decrypted;
    }

    /**
     * Clear master key from memory
     */
    lock() {
        if (this.masterKey) {
            crypto.randomFillSync(this.masterKey);
            this.masterKey = null;
        }
        this.salt = null;
    }

    /**
     * Check if encryption is unlocked
     */
    isUnlocked() {
        return this.masterKey !== null;
    }

    /**
     * Generate a secure random password
     * @param {Object} options - Password generation options
     * @returns {string} Generated password
     */
    generatePassword(options = {}) {
        const defaults = {
            length: 16,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: true,
            excludeSimilar: false,
            excludeAmbiguous: false
        };

        const opts = { ...defaults, ...options };
        let charset = '';
        let password = '';

        if (opts.lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
        if (opts.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (opts.numbers) charset += '0123456789';
        if (opts.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

        // Exclude similar characters if requested
        if (opts.excludeSimilar) {
            charset = charset.replace(/[ilLI|1oO0]/g, '');
        }

        // Exclude ambiguous characters if requested
        if (opts.excludeAmbiguous) {
            charset = charset.replace(/[{}[\]()\/\\'"~,;.<>]/g, '');
        }

        // Generate password using crypto random
        for (let i = 0; i < opts.length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }

        return password;
    }

    /**
     * Check password strength
     * @param {string} password - Password to check
     * @returns {Object} Strength score and feedback
     */
    checkPasswordStrength(password) {
        let score = 0;
        const feedback = [];

        // Length check
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        if (password.length >= 16) score += 1;

        // Character diversity
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^A-Za-z0-9]/.test(password)) score += 1;

        // Common patterns (negative score)
        if (/(.)\1{2,}/.test(password)) {
            score -= 1;
            feedback.push('Avoid repeating characters');
        }
        if (/^[0-9]+$/.test(password)) {
            score -= 1;
            feedback.push('Use more than just numbers');
        }
        if (/^[a-zA-Z]+$/.test(password)) {
            score -= 1;
            feedback.push('Add numbers or symbols');
        }

        // Determine strength level
        let strength = 'Very Weak';
        if (score >= 7) strength = 'Very Strong';
        else if (score >= 5) strength = 'Strong';
        else if (score >= 3) strength = 'Fair';
        else if (score >= 2) strength = 'Weak';

        return {
            score: Math.max(0, Math.min(score, 10)),
            strength,
            feedback
        };
    }
}

module.exports = PasswordEncryption;