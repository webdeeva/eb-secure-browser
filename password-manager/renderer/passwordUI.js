/**
 * Password Manager UI for Everything Black Browser
 * Handles all frontend interactions and IPC communication
 */

class PasswordUI {
    constructor() {
        this.isLocked = true;
        this.currentView = 'all';
        this.passwordEntries = [];
        this.selectedTags = [];
        this.isSetup = false;
        this.initializeUI();
    }

    /**
     * Initialize the password manager UI
     */
    async initializeUI() {
        await this.checkMasterPassword();
        this.setupEventListeners();
        this.setupIPCListeners();
    }

    /**
     * Check if master password is set up
     */
    async checkMasterPassword() {
        try {
            const hasPassword = await window.electronAPI.passwordManager.hasMasterPassword();
            this.isSetup = hasPassword;
            
            if (!hasPassword) {
                this.showSetupScreen();
            } else {
                this.showUnlockScreen();
            }
        } catch (error) {
            console.error('Failed to check master password:', error);
        }
    }

    /**
     * Show master password setup screen
     */
    showSetupScreen() {
        const container = document.getElementById('password-manager-content');
        container.innerHTML = `
            <div class="password-unlock-screen">
                <div class="password-setup-container">
                    <i class="fas fa-shield-alt password-logo"></i>
                    <h3>Set Up Your Master Password</h3>
                    <p class="password-intro">Create a strong master password to protect your saved passwords</p>
                    
                    <form id="password-setup-form" class="password-unlock-form">
                        <div class="password-input-group">
                            <label>Master Password</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="master-password" required minlength="8" 
                                       placeholder="Enter a strong password">
                                <button type="button" class="password-toggle-visibility" data-target="master-password">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                            <div class="password-strength-meter">
                                <div class="password-strength-bar" id="strength-bar"></div>
                            </div>
                            <div class="password-strength-text" id="strength-text"></div>
                        </div>
                        
                        <div class="password-input-group">
                            <label>Confirm Password</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="confirm-password" required minlength="8"
                                       placeholder="Confirm your password">
                                <button type="button" class="password-toggle-visibility" data-target="confirm-password">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="password-requirements">
                            <p class="requirement-title">Password Requirements:</p>
                            <ul>
                                <li id="req-length"><i class="fas fa-times"></i> At least 8 characters</li>
                                <li id="req-upper"><i class="fas fa-times"></i> Uppercase letter</li>
                                <li id="req-lower"><i class="fas fa-times"></i> Lowercase letter</li>
                                <li id="req-number"><i class="fas fa-times"></i> Number</li>
                                <li id="req-special"><i class="fas fa-times"></i> Special character</li>
                            </ul>
                        </div>
                        
                        <button type="submit" class="btn-save" disabled>Create Master Password</button>
                    </form>
                </div>
            </div>
        `;

        this.setupSetupFormHandlers();
    }

    /**
     * Show unlock screen
     */
    showUnlockScreen() {
        const container = document.getElementById('password-manager-content');
        container.innerHTML = `
            <div class="password-unlock-screen">
                <div class="password-unlock-container">
                    <i class="fas fa-lock password-logo"></i>
                    <h3>Unlock Password Manager</h3>
                    <p class="password-intro">Enter your master password to access your saved passwords</p>
                    
                    <form id="password-unlock-form" class="password-unlock-form">
                        <div class="password-input-group">
                            <label>Master Password</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="unlock-password" required 
                                       placeholder="Enter your master password">
                                <button type="button" class="password-toggle-visibility" data-target="unlock-password">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn-save">Unlock</button>
                    </form>
                    
                    <div class="password-footer-links">
                        <a href="#" id="forgot-password">Forgot password?</a>
                    </div>
                </div>
            </div>
        `;

        this.setupUnlockFormHandlers();
    }

    /**
     * Show main password manager interface
     */
    showMainInterface() {
        const container = document.getElementById('password-manager-content');
        container.innerHTML = `
            <div class="password-panel active">
                <div class="password-manager-header">
                    <div class="password-search">
                        <input type="text" id="password-search-input" 
                               placeholder="Search passwords...">
                        <i class="fas fa-search password-search-icon"></i>
                    </div>
                </div>
                
                <div class="password-categories">
                    <div class="password-category active" data-category="all">
                        <i class="fas fa-list"></i>
                        <span>All Passwords</span>
                        <span class="password-category-count" id="count-all">0</span>
                    </div>
                    <div class="password-category" data-category="favorites">
                        <i class="fas fa-star"></i>
                        <span>Favorites</span>
                        <span class="password-category-count" id="count-favorites">0</span>
                    </div>
                    <div class="password-category" data-category="recent">
                        <i class="fas fa-clock"></i>
                        <span>Recently Used</span>
                        <span class="password-category-count" id="count-recent">0</span>
                    </div>
                    <div class="password-category" data-category="notes">
                        <i class="fas fa-sticky-note"></i>
                        <span>Secure Notes</span>
                        <span class="password-category-count" id="count-notes">0</span>
                    </div>
                </div>
                
                <div class="password-list" id="password-list">
                    <!-- Password items will be populated here -->
                </div>
                
                <button class="password-add-btn" id="add-password-btn">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            
            <!-- Password Entry Modal -->
            <div class="password-modal" id="password-modal">
                <div class="password-modal-content">
                    <div class="password-modal-header">
                        <h3 class="password-modal-title">Add Password</h3>
                        <button class="password-modal-close" id="modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="password-modal-body">
                        <form id="password-entry-form">
                            <div class="password-form-group">
                                <label>Website/Domain</label>
                                <input type="text" id="entry-domain" required 
                                       placeholder="example.com">
                            </div>
                            
                            <div class="password-form-group">
                                <label>Username/Email</label>
                                <input type="text" id="entry-username" 
                                       placeholder="username@example.com">
                            </div>
                            
                            <div class="password-form-group">
                                <label>Password</label>
                                <div class="password-input-with-actions">
                                    <input type="password" id="entry-password" required>
                                    <button type="button" class="password-toggle-btn" 
                                            id="toggle-password-visibility">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button type="button" class="password-generate-btn" 
                                            id="generate-password">
                                        <i class="fas fa-sync"></i>
                                    </button>
                                    <button type="button" class="password-copy-btn" 
                                            id="copy-password">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                                
                                <!-- Password Generator -->
                                <div class="password-generator" id="password-generator" style="display: none;">
                                    <div class="password-generator-controls">
                                        <label>Password Length: <span id="length-display">16</span></label>
                                        <input type="range" id="password-length" 
                                               class="password-length-slider"
                                               min="8" max="32" value="16">
                                    </div>
                                    
                                    <div class="password-generator-options">
                                        <div class="password-option">
                                            <input type="checkbox" id="use-uppercase" checked>
                                            <label for="use-uppercase">Uppercase (A-Z)</label>
                                        </div>
                                        <div class="password-option">
                                            <input type="checkbox" id="use-lowercase" checked>
                                            <label for="use-lowercase">Lowercase (a-z)</label>
                                        </div>
                                        <div class="password-option">
                                            <input type="checkbox" id="use-numbers" checked>
                                            <label for="use-numbers">Numbers (0-9)</label>
                                        </div>
                                        <div class="password-option">
                                            <input type="checkbox" id="use-symbols" checked>
                                            <label for="use-symbols">Symbols (!@#$...)</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="password-form-group">
                                <label>Notes (Optional)</label>
                                <textarea id="entry-notes" rows="3" 
                                          placeholder="Add any additional notes..."></textarea>
                            </div>
                            
                            <div class="password-form-group">
                                <label>Tags (Optional)</label>
                                <div class="password-tags" id="entry-tags">
                                    <!-- Tags will be added here -->
                                </div>
                                <div class="password-tag-input">
                                    <input type="text" id="new-tag" placeholder="Add tag...">
                                    <button type="button" class="password-tag-add-btn" id="add-tag">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                    
                    <div class="password-modal-footer">
                        <button class="btn-cancel" id="modal-cancel">Cancel</button>
                        <button class="btn-save" id="modal-save">Save Password</button>
                    </div>
                </div>
            </div>
        `;

        this.loadPasswords();
        this.setupMainInterfaceHandlers();
    }

    /**
     * Setup event handlers for setup form
     */
    setupSetupFormHandlers() {
        const form = document.getElementById('password-setup-form');
        const masterInput = document.getElementById('master-password');
        const confirmInput = document.getElementById('confirm-password');
        const submitBtn = form.querySelector('.btn-save');

        // Password strength checking
        masterInput.addEventListener('input', () => {
            this.checkPasswordStrength(masterInput.value);
            this.validateSetupForm();
        });

        confirmInput.addEventListener('input', () => {
            this.validateSetupForm();
        });

        // Toggle password visibility
        document.querySelectorAll('.password-toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                const icon = btn.querySelector('i');
                
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.className = 'fas fa-eye-slash';
                } else {
                    input.type = 'password';
                    icon.className = 'fas fa-eye';
                }
            });
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const masterPassword = masterInput.value;
            const confirmPassword = confirmInput.value;
            
            if (masterPassword !== confirmPassword) {
                this.showNotification('Passwords do not match', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';
            
            try {
                const result = await window.electronAPI.passwordManager.setupMasterPassword(masterPassword);
                
                if (result.success) {
                    this.isLocked = false;
                    this.showNotification('Master password created successfully', 'success');
                    this.showMainInterface();
                } else {
                    this.showNotification(result.error, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Master Password';
                }
            } catch (error) {
                console.error('Setup error:', error);
                this.showNotification('Failed to set up master password', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Master Password';
            }
        });
    }

    /**
     * Setup event handlers for unlock form
     */
    setupUnlockFormHandlers() {
        const form = document.getElementById('password-unlock-form');
        const passwordInput = document.getElementById('unlock-password');
        const submitBtn = form.querySelector('.btn-save');

        // Toggle password visibility
        document.querySelector('.password-toggle-visibility').addEventListener('click', function() {
            const input = document.getElementById(this.dataset.target);
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Unlocking...';
            
            try {
                const result = await window.electronAPI.passwordManager.unlock(passwordInput.value);
                
                if (result.success) {
                    this.isLocked = false;
                    this.showNotification('Password manager unlocked', 'success');
                    this.showMainInterface();
                } else {
                    this.showNotification('Incorrect master password', 'error');
                    passwordInput.value = '';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Unlock';
                }
            } catch (error) {
                console.error('Unlock error:', error);
                this.showNotification('Failed to unlock', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Unlock';
            }
        });

        // Forgot password link
        document.getElementById('forgot-password').addEventListener('click', (e) => {
            e.preventDefault();
            this.showNotification('Password recovery requires resetting all data', 'warning');
        });
    }

    /**
     * Setup main interface handlers
     */
    setupMainInterfaceHandlers() {
        // Category selection
        document.querySelectorAll('.password-category').forEach(cat => {
            cat.addEventListener('click', () => {
                document.querySelector('.password-category.active').classList.remove('active');
                cat.classList.add('active');
                this.currentView = cat.dataset.category;
                this.filterPasswords();
            });
        });

        // Search
        document.getElementById('password-search-input').addEventListener('input', (e) => {
            this.searchPasswords(e.target.value);
        });

        // Add password button
        document.getElementById('add-password-btn').addEventListener('click', () => {
            this.showPasswordModal();
        });

        // Modal handlers
        this.setupModalHandlers();
    }

    /**
     * Setup modal handlers
     */
    setupModalHandlers() {
        const modal = document.getElementById('password-modal');
        const closeBtn = document.getElementById('modal-close');
        const cancelBtn = document.getElementById('modal-cancel');
        const saveBtn = document.getElementById('modal-save');
        const generateBtn = document.getElementById('generate-password');
        const toggleBtn = document.getElementById('toggle-password-visibility');
        const copyBtn = document.getElementById('copy-password');
        const generatorDiv = document.getElementById('password-generator');

        // Close modal
        [closeBtn, cancelBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
                this.resetPasswordForm();
            });
        });

        // Toggle password visibility
        toggleBtn.addEventListener('click', () => {
            const input = document.getElementById('entry-password');
            const icon = toggleBtn.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });

        // Generate password
        generateBtn.addEventListener('click', () => {
            if (generatorDiv.style.display === 'none') {
                generatorDiv.style.display = 'block';
                this.generateNewPassword();
            } else {
                generatorDiv.style.display = 'none';
            }
        });

        // Copy password
        copyBtn.addEventListener('click', () => {
            const passwordInput = document.getElementById('entry-password');
            navigator.clipboard.writeText(passwordInput.value);
            this.showNotification('Password copied to clipboard', 'success');
        });

        // Password generator controls
        document.getElementById('password-length').addEventListener('input', (e) => {
            document.getElementById('length-display').textContent = e.target.value;
            this.generateNewPassword();
        });

        ['use-uppercase', 'use-lowercase', 'use-numbers', 'use-symbols'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.generateNewPassword();
            });
        });

        // Tags
        document.getElementById('add-tag').addEventListener('click', () => {
            const input = document.getElementById('new-tag');
            if (input.value.trim()) {
                this.addTag(input.value.trim());
                input.value = '';
            }
        });

        document.getElementById('new-tag').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const input = e.target;
                if (input.value.trim()) {
                    this.addTag(input.value.trim());
                    input.value = '';
                }
            }
        });

        // Save password
        saveBtn.addEventListener('click', async () => {
            const passwordData = {
                domain: document.getElementById('entry-domain').value,
                username: document.getElementById('entry-username').value,
                password: document.getElementById('entry-password').value,
                notes: document.getElementById('entry-notes').value,
                tags: this.selectedTags
            };

            if (!passwordData.domain || !passwordData.password) {
                this.showNotification('Domain and password are required', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                const result = await window.electronAPI.passwordManager.addPassword(passwordData);
                
                if (result.success) {
                    this.showNotification('Password saved successfully', 'success');
                    modal.classList.remove('active');
                    this.resetPasswordForm();
                    this.loadPasswords();
                } else {
                    this.showNotification(result.error, 'error');
                }
            } catch (error) {
                console.error('Save error:', error);
                this.showNotification('Failed to save password', 'error');
            }

            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Password';
        });
    }

    /**
     * Load and display passwords
     */
    async loadPasswords() {
        try {
            const result = await window.electronAPI.passwordManager.getPasswords();
            
            if (result.success) {
                this.passwordEntries = result.passwords;
                this.displayPasswords();
                this.updateCounts();
            }
        } catch (error) {
            console.error('Failed to load passwords:', error);
        }
    }

    /**
     * Display password list
     */
    displayPasswords() {
        const listContainer = document.getElementById('password-list');
        
        if (this.passwordEntries.length === 0) {
            listContainer.innerHTML = `
                <div class="password-empty-state">
                    <i class="fas fa-key password-empty-icon"></i>
                    <h3 class="password-empty-title">No Passwords Yet</h3>
                    <p class="password-empty-text">Click the + button to add your first password</p>
                </div>
            `;
            return;
        }

        const html = this.passwordEntries.map(entry => `
            <div class="password-item" data-id="${entry.id}">
                <div class="password-item-header">
                    <img src="https://www.google.com/s2/favicons?domain=${entry.domain}" 
                         class="password-item-favicon" 
                         onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"%23f78513\"><path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z\"/></svg>'">
                    <span class="password-item-domain">${entry.domain}</span>
                    <div class="password-item-actions">
                        <button class="password-action-btn" data-action="copy-username" 
                                title="Copy username">
                            <i class="fas fa-user"></i>
                        </button>
                        <button class="password-action-btn" data-action="copy-password" 
                                title="Copy password">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="password-action-btn" data-action="edit" 
                                title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="password-action-btn" data-action="delete" 
                                title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="password-item-username">${entry.username || 'No username'}</div>
                ${entry.tags && entry.tags.length > 0 ? `
                    <div class="password-tags">
                        ${entry.tags.map(tag => `<span class="password-tag">${tag}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        listContainer.innerHTML = html;

        // Add action handlers
        document.querySelectorAll('.password-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const itemId = btn.closest('.password-item').dataset.id;
                this.handlePasswordAction(action, itemId);
            });
        });

        // Click to view details
        document.querySelectorAll('.password-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.viewPasswordDetails(id);
            });
        });
    }

    /**
     * Handle password item actions
     */
    async handlePasswordAction(action, id) {
        const entry = this.passwordEntries.find(p => p.id === id);
        
        switch (action) {
            case 'copy-username':
                if (entry.username) {
                    navigator.clipboard.writeText(entry.username);
                    this.showNotification('Username copied', 'success');
                }
                break;
                
            case 'copy-password':
                navigator.clipboard.writeText(entry.password);
                this.showNotification('Password copied', 'success');
                break;
                
            case 'edit':
                this.editPassword(id);
                break;
                
            case 'delete':
                if (confirm(`Delete password for ${entry.domain}?`)) {
                    await this.deletePassword(id);
                }
                break;
        }
    }

    /**
     * Delete password
     */
    async deletePassword(id) {
        try {
            const result = await window.electronAPI.passwordManager.deletePassword(id);
            
            if (result.success) {
                this.showNotification('Password deleted', 'success');
                this.loadPasswords();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Failed to delete password', 'error');
        }
    }

    /**
     * Check password strength
     */
    async checkPasswordStrength(password) {
        const strengthBar = document.getElementById('strength-bar');
        const strengthText = document.getElementById('strength-text');
        
        if (!password) {
            strengthBar.className = 'password-strength-bar';
            strengthText.textContent = '';
            return;
        }

        // Check requirements
        document.getElementById('req-length').innerHTML = 
            password.length >= 8 
                ? '<i class="fas fa-check"></i> At least 8 characters' 
                : '<i class="fas fa-times"></i> At least 8 characters';
                
        document.getElementById('req-upper').innerHTML = 
            /[A-Z]/.test(password)
                ? '<i class="fas fa-check"></i> Uppercase letter'
                : '<i class="fas fa-times"></i> Uppercase letter';
                
        document.getElementById('req-lower').innerHTML = 
            /[a-z]/.test(password)
                ? '<i class="fas fa-check"></i> Lowercase letter'
                : '<i class="fas fa-times"></i> Lowercase letter';
                
        document.getElementById('req-number').innerHTML = 
            /[0-9]/.test(password)
                ? '<i class="fas fa-check"></i> Number'
                : '<i class="fas fa-times"></i> Number';
                
        document.getElementById('req-special').innerHTML = 
            /[^A-Za-z0-9]/.test(password)
                ? '<i class="fas fa-check"></i> Special character'
                : '<i class="fas fa-times"></i> Special character';

        // Calculate strength
        const result = await window.electronAPI.passwordManager.checkStrength(password);
        
        if (result.success) {
            const strength = result.strength;
            
            if (strength.score < 3) {
                strengthBar.className = 'password-strength-bar weak';
                strengthText.textContent = 'Weak';
            } else if (strength.score < 5) {
                strengthBar.className = 'password-strength-bar fair';
                strengthText.textContent = 'Fair';
            } else if (strength.score < 7) {
                strengthBar.className = 'password-strength-bar strong';
                strengthText.textContent = 'Strong';
            } else {
                strengthBar.className = 'password-strength-bar very-strong';
                strengthText.textContent = 'Very Strong';
            }
        }
    }

    /**
     * Validate setup form
     */
    validateSetupForm() {
        const masterPassword = document.getElementById('master-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const submitBtn = document.querySelector('#password-setup-form .btn-save');
        
        const isValid = 
            masterPassword.length >= 8 &&
            /[A-Z]/.test(masterPassword) &&
            /[a-z]/.test(masterPassword) &&
            /[0-9]/.test(masterPassword) &&
            masterPassword === confirmPassword;
            
        submitBtn.disabled = !isValid;
    }

    /**
     * Generate new password
     */
    async generateNewPassword() {
        const options = {
            length: parseInt(document.getElementById('password-length').value),
            uppercase: document.getElementById('use-uppercase').checked,
            lowercase: document.getElementById('use-lowercase').checked,
            numbers: document.getElementById('use-numbers').checked,
            symbols: document.getElementById('use-symbols').checked
        };

        try {
            const result = await window.electronAPI.passwordManager.generatePassword(options);
            
            if (result.success) {
                document.getElementById('entry-password').value = result.password;
            }
        } catch (error) {
            console.error('Failed to generate password:', error);
        }
    }

    /**
     * Show password modal
     */
    showPasswordModal() {
        const modal = document.getElementById('password-modal');
        modal.classList.add('active');
        this.selectedTags = [];
    }

    /**
     * Reset password form
     */
    resetPasswordForm() {
        document.getElementById('password-entry-form').reset();
        document.getElementById('entry-tags').innerHTML = '';
        document.getElementById('password-generator').style.display = 'none';
        this.selectedTags = [];
    }

    /**
     * Add tag
     */
    addTag(tag) {
        if (!this.selectedTags.includes(tag)) {
            this.selectedTags.push(tag);
            const tagsContainer = document.getElementById('entry-tags');
            const tagElement = document.createElement('span');
            tagElement.className = 'password-tag selected';
            tagElement.textContent = tag;
            tagElement.onclick = () => {
                this.selectedTags = this.selectedTags.filter(t => t !== tag);
                tagElement.remove();
            };
            tagsContainer.appendChild(tagElement);
        }
    }

    /**
     * Filter passwords by view
     */
    filterPasswords() {
        // This will be implemented based on category selection
        this.displayPasswords();
    }

    /**
     * Search passwords
     */
    async searchPasswords(query) {
        if (!query.trim()) {
            this.loadPasswords();
            return;
        }

        try {
            const result = await window.electronAPI.passwordManager.searchPasswords(query);
            
            if (result.success) {
                this.passwordEntries = result.passwords;
                this.displayPasswords();
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    /**
     * Update category counts
     */
    updateCounts() {
        document.getElementById('count-all').textContent = this.passwordEntries.length;
        // Additional count updates can be added here
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `password-notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Setup IPC listeners
     */
    setupIPCListeners() {
        // Listen for auto-lock
        window.electronAPI.onPasswordManagerLocked(() => {
            this.isLocked = true;
            this.showUnlockScreen();
        });
    }

    /**
     * Setup general event listeners
     */
    setupEventListeners() {
        // Handle tab visibility change for auto-lock
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isLocked && this.isSetup) {
                this.showUnlockScreen();
            }
        });
    }

    /**
     * View password details
     */
    viewPasswordDetails(id) {
        // This could open a detailed view or edit modal
        this.editPassword(id);
    }

    /**
     * Edit password
     */
    editPassword(id) {
        const entry = this.passwordEntries.find(p => p.id === id);
        if (!entry) return;

        // Populate modal with existing data
        document.getElementById('entry-domain').value = entry.domain;
        document.getElementById('entry-username').value = entry.username || '';
        document.getElementById('entry-password').value = entry.password;
        document.getElementById('entry-notes').value = entry.notes || '';
        
        // Set tags
        this.selectedTags = entry.tags || [];
        const tagsContainer = document.getElementById('entry-tags');
        tagsContainer.innerHTML = '';
        this.selectedTags.forEach(tag => this.addTag(tag));

        // Update modal for editing
        document.querySelector('.password-modal-title').textContent = 'Edit Password';
        document.getElementById('modal-save').textContent = 'Update Password';
        
        // Store the ID for updating
        document.getElementById('password-entry-form').dataset.editId = id;
        
        // Show modal
        this.showPasswordModal();
    }
}

// Export for use in renderer
window.PasswordUI = PasswordUI;