/**
 * Database Module for Everything Black Password Manager
 * Uses SQLite for local encrypted storage
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');

class PasswordDatabase {
    constructor() {
        this.db = null;
    }

    /**
     * Initialize the database
     */
    initialize() {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'passwords.db');
        
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Better performance
        this.db.pragma('synchronous = NORMAL'); // Balance speed/safety
        
        this.createTables();
        return this;
    }

    /**
     * Create database tables if they don't exist
     */
    createTables() {
        // Master settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS password_settings (
                id INTEGER PRIMARY KEY,
                salt TEXT NOT NULL,
                iterations INTEGER DEFAULT 100000,
                verification_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME
            )
        `);

        // Password entries table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS passwords (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                username TEXT,
                encrypted_password TEXT NOT NULL,
                encrypted_notes TEXT,
                favicon TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME,
                use_count INTEGER DEFAULT 0,
                tags TEXT
            )
        `);

        // Password history table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS password_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                password_id TEXT,
                encrypted_old_password TEXT,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(password_id) REFERENCES passwords(id) ON DELETE CASCADE
            )
        `);

        // Secure notes table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS secure_notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                encrypted_content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                modified_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_passwords_domain ON passwords(domain);
            CREATE INDEX IF NOT EXISTS idx_passwords_username ON passwords(username);
            CREATE INDEX IF NOT EXISTS idx_passwords_modified ON passwords(modified_at);
        `);
    }

    /**
     * Check if master password has been set up
     */
    hasMasterPassword() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM password_settings');
        const result = stmt.get();
        return result.count > 0;
    }

    /**
     * Save master password settings
     */
    saveMasterPasswordSettings(salt, verificationHash, iterations) {
        // Delete existing settings (there should only be one)
        this.db.prepare('DELETE FROM password_settings').run();
        
        // Insert new settings
        const stmt = this.db.prepare(`
            INSERT INTO password_settings (salt, verification_hash, iterations)
            VALUES (?, ?, ?)
        `);
        
        stmt.run(salt, verificationHash, iterations);
    }

    /**
     * Get master password settings
     */
    getMasterPasswordSettings() {
        const stmt = this.db.prepare('SELECT * FROM password_settings LIMIT 1');
        return stmt.get();
    }

    /**
     * Update last accessed time
     */
    updateLastAccessed() {
        const stmt = this.db.prepare(`
            UPDATE password_settings 
            SET last_accessed = CURRENT_TIMESTAMP
        `);
        stmt.run();
    }

    /**
     * Save a new password entry
     */
    savePassword(passwordData) {
        const id = passwordData.id || uuidv4();
        
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO passwords (
                id, domain, username, encrypted_password, 
                encrypted_notes, favicon, tags, modified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        stmt.run(
            id,
            passwordData.domain,
            passwordData.username || '',
            passwordData.encrypted_password,
            passwordData.encrypted_notes || null,
            passwordData.favicon || null,
            JSON.stringify(passwordData.tags || [])
        );
        
        return id;
    }

    /**
     * Get all passwords or filter by domain
     */
    getPasswords(domain = null) {
        let stmt;
        
        if (domain) {
            stmt = this.db.prepare(`
                SELECT * FROM passwords 
                WHERE domain LIKE ? 
                ORDER BY last_used DESC, modified_at DESC
            `);
            return stmt.all(`%${domain}%`);
        } else {
            stmt = this.db.prepare(`
                SELECT * FROM passwords 
                ORDER BY modified_at DESC
            `);
            return stmt.all();
        }
    }

    /**
     * Get a single password by ID
     */
    getPassword(id) {
        const stmt = this.db.prepare('SELECT * FROM passwords WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Update password use statistics
     */
    updatePasswordUsage(id) {
        const stmt = this.db.prepare(`
            UPDATE passwords 
            SET last_used = CURRENT_TIMESTAMP, 
                use_count = use_count + 1 
            WHERE id = ?
        `);
        stmt.run(id);
    }

    /**
     * Delete a password entry
     */
    deletePassword(id) {
        // First, save to history if it exists
        const password = this.getPassword(id);
        if (password) {
            this.addToPasswordHistory(id, password.encrypted_password);
        }
        
        const stmt = this.db.prepare('DELETE FROM passwords WHERE id = ?');
        return stmt.run(id);
    }

    /**
     * Add password to history (for recovery)
     */
    addToPasswordHistory(passwordId, encryptedPassword) {
        const stmt = this.db.prepare(`
            INSERT INTO password_history (password_id, encrypted_old_password)
            VALUES (?, ?)
        `);
        stmt.run(passwordId, encryptedPassword);
        
        // Keep only last 5 versions
        this.db.prepare(`
            DELETE FROM password_history 
            WHERE password_id = ? 
            AND id NOT IN (
                SELECT id FROM password_history 
                WHERE password_id = ? 
                ORDER BY changed_at DESC 
                LIMIT 5
            )
        `).run(passwordId, passwordId);
    }

    /**
     * Get password history
     */
    getPasswordHistory(passwordId) {
        const stmt = this.db.prepare(`
            SELECT * FROM password_history 
            WHERE password_id = ? 
            ORDER BY changed_at DESC
        `);
        return stmt.all(passwordId);
    }

    /**
     * Save a secure note
     */
    saveSecureNote(noteData) {
        const id = noteData.id || uuidv4();
        
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO secure_notes (
                id, title, encrypted_content, modified_at
            ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        stmt.run(
            id,
            noteData.title,
            noteData.encrypted_content
        );
        
        return id;
    }

    /**
     * Get all secure notes
     */
    getSecureNotes() {
        const stmt = this.db.prepare(`
            SELECT * FROM secure_notes 
            ORDER BY modified_at DESC
        `);
        return stmt.all();
    }

    /**
     * Delete a secure note
     */
    deleteSecureNote(id) {
        const stmt = this.db.prepare('DELETE FROM secure_notes WHERE id = ?');
        return stmt.run(id);
    }

    /**
     * Search passwords by username or domain
     */
    searchPasswords(query) {
        const stmt = this.db.prepare(`
            SELECT * FROM passwords 
            WHERE domain LIKE ? OR username LIKE ?
            ORDER BY last_used DESC, modified_at DESC
        `);
        return stmt.all(`%${query}%`, `%${query}%`);
    }

    /**
     * Get passwords by tag
     */
    getPasswordsByTag(tag) {
        const stmt = this.db.prepare(`
            SELECT * FROM passwords 
            WHERE tags LIKE ?
            ORDER BY modified_at DESC
        `);
        return stmt.all(`%"${tag}"%`);
    }

    /**
     * Get all unique tags
     */
    getAllTags() {
        const passwords = this.getPasswords();
        const tagSet = new Set();
        
        passwords.forEach(p => {
            try {
                const tags = JSON.parse(p.tags || '[]');
                tags.forEach(tag => tagSet.add(tag));
            } catch (e) {
                // Ignore parse errors
            }
        });
        
        return Array.from(tagSet).sort();
    }

    /**
     * Check for duplicate passwords
     */
    findDuplicatePasswords() {
        const passwords = this.getPasswords();
        const passwordMap = new Map();
        const duplicates = [];
        
        passwords.forEach(p => {
            if (!passwordMap.has(p.encrypted_password)) {
                passwordMap.set(p.encrypted_password, []);
            }
            passwordMap.get(p.encrypted_password).push(p);
        });
        
        passwordMap.forEach((entries, encPassword) => {
            if (entries.length > 1) {
                duplicates.push(entries);
            }
        });
        
        return duplicates;
    }

    /**
     * Get password statistics
     */
    getStatistics() {
        const totalPasswords = this.db.prepare('SELECT COUNT(*) as count FROM passwords').get().count;
        const totalNotes = this.db.prepare('SELECT COUNT(*) as count FROM secure_notes').get().count;
        const recentlyUsed = this.db.prepare(`
            SELECT COUNT(*) as count FROM passwords 
            WHERE last_used > datetime('now', '-7 days')
        `).get().count;
        
        const duplicates = this.findDuplicatePasswords();
        
        return {
            totalPasswords,
            totalNotes,
            recentlyUsed,
            duplicateCount: duplicates.length,
            allTags: this.getAllTags()
        };
    }

    /**
     * Export all data (for backup)
     */
    exportData() {
        return {
            settings: this.getMasterPasswordSettings(),
            passwords: this.getPasswords(),
            notes: this.getSecureNotes(),
            exportDate: new Date().toISOString()
        };
    }

    /**
     * Import data (from backup)
     */
    importData(data) {
        // Import passwords
        if (data.passwords) {
            data.passwords.forEach(p => this.savePassword(p));
        }
        
        // Import notes
        if (data.notes) {
            data.notes.forEach(n => this.saveSecureNote(n));
        }
        
        return {
            passwordsImported: data.passwords?.length || 0,
            notesImported: data.notes?.length || 0
        };
    }

    /**
     * Clear all data (factory reset)
     */
    clearAllData() {
        this.db.exec('DELETE FROM passwords');
        this.db.exec('DELETE FROM password_history');
        this.db.exec('DELETE FROM secure_notes');
        this.db.exec('DELETE FROM password_settings');
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = PasswordDatabase;