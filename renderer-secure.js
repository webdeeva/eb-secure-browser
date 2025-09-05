// ==========================================
// SECURE RENDERER - NO NODE.JS ACCESS
// Uses ONLY ebAPI from preload-secure.js
// ==========================================

// Global variables
let web3Instance = null;
let web3LoadPromise = null;

// Async Web3 loader with timeout and error handling (fallback implementation)
async function loadWeb3() {
    if (web3LoadPromise) {
        return web3LoadPromise;
    }

    web3LoadPromise = Promise.race([
        // Try to load Web3 (fallback - may not work in sandbox)
        (async () => {
            try {
                console.log('[Web3Loader] Attempting Web3 import...');
                // Note: This may fail in sandbox mode, that's expected
                return { success: false, error: 'Web3 not available in secure mode' };
            } catch (error) {
                console.warn('[Web3Loader] Failed to load Web3:', error.message);
                return { success: false, error: error.message };
            }
        })(),
        // Timeout after 5 seconds
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Web3 loading timeout'));
            }, 5000);
        })
    ]).catch(error => {
        console.warn('[Web3Loader] Web3 loading failed or timed out:', error.message);
        return { success: false, error: error.message };
    });

    return web3LoadPromise;
}

// Get Web3 instance (load if needed)
async function getWeb3() {
    if (web3Instance) {
        return web3Instance;
    }
    
    const result = await loadWeb3();
    return result.success ? result.Web3 : null;
}

// Web3 utility functions with fallback behavior
const Web3Utils = {
    // Check if Web3 is available
    async isAvailable() {
        const web3 = await getWeb3();
        return web3 !== null;
    },

    // Get Web3 status for debugging
    getStatus() {
        return {
            loaded: web3Instance !== null,
            loading: web3LoadPromise !== null,
            available: web3Instance !== null
        };
    },

    // Safe Web3 execution with fallback
    async execute(fn, fallback = null) {
        try {
            const web3 = await getWeb3();
            if (web3) {
                return await fn(web3);
            } else {
                console.log('[Web3Utils] Web3 not available, using fallback');
                return fallback;
            }
        } catch (error) {
            console.warn('[Web3Utils] Web3 operation failed:', error.message);
            return fallback;
        }
    }
};

// Initialize Web3 loading in background (non-blocking)
setTimeout(() => {
    loadWeb3().then(result => {
        if (result.success) {
            console.log('[Web3Loader] Web3 ready for use');
            // Emit event that Web3 is ready (if needed by other parts)
            window.dispatchEvent(new CustomEvent('web3-ready', { detail: result.Web3 }));
        } else {
            console.log('[Web3Loader] Browser will continue without Web3:', result.error);
            // Emit event that Web3 failed to load
            window.dispatchEvent(new CustomEvent('web3-unavailable', { detail: result.error }));
        }
    });
}, 100); // Small delay to ensure UI loads first

// ==========================================
// SECURE MODAL SYSTEM
// ==========================================
class ModalSystem {
    constructor() {
        this.modal = document.getElementById('custom-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalMessage = document.getElementById('modal-message');
        this.modalOk = document.getElementById('modal-ok');
        this.modalCancel = document.getElementById('modal-cancel');
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        if (this.modalOk) {
            this.modalOk.addEventListener('click', () => this.handleOk());
        }
        if (this.modalCancel) {
            this.modalCancel.addEventListener('click', () => this.handleCancel());
        }
        
        // Close on background click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.handleCancel();
                }
            });
        }
    }
    
    alert(message, title = 'Everything Black Browser') {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            if (this.modalTitle) this.modalTitle.textContent = title;
            if (this.modalMessage) this.modalMessage.textContent = message;
            if (this.modalCancel) this.modalCancel.style.display = 'none';
            if (this.modal) this.modal.style.display = 'flex';
        });
    }
    
    confirm(message, title = 'Everything Black Browser') {
        console.log('[ModalSystem] confirm called with:', message);
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            if (this.modalTitle) this.modalTitle.textContent = title;
            if (this.modalMessage) this.modalMessage.textContent = message;
            if (this.modalCancel) this.modalCancel.style.display = 'inline-block';
            if (this.modal) this.modal.style.display = 'flex';
            console.log('[ModalSystem] Modal display set to flex');
        });
    }
    
    prompt(message, title = 'Everything Black Browser') {
        return new Promise((resolve) => {
            if (!this.modal) {
                resolve(null);
                return;
            }
            
            // For now, use a simple prompt with textarea
            const modalContent = this.modal.querySelector('.modal-content');
            const originalHTML = modalContent.innerHTML;
            
            modalContent.innerHTML = `
                <div class="modal-header">
                    <img src="assets/ebwhite.png" alt="EB" class="modal-logo">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                    <textarea id="prompt-input" style="width: 100%; height: 100px; margin-top: 10px; padding: 8px; background: #050505; border: 1px solid #C44901; color: #C44901; border-radius: 4px;"></textarea>
                </div>
                <div class="modal-footer">
                    <button id="prompt-ok" class="wallet-btn">OK</button>
                    <button id="prompt-cancel" class="wallet-btn">Cancel</button>
                </div>
            `;
            
            this.modal.style.display = 'flex';
            
            const promptOk = document.getElementById('prompt-ok');
            const promptCancel = document.getElementById('prompt-cancel');
            const promptInput = document.getElementById('prompt-input');
            
            const cleanup = () => {
                modalContent.innerHTML = originalHTML;
                this.setupEventListeners();
            };
            
            if (promptOk) {
                promptOk.onclick = () => {
                    this.modal.style.display = 'none';
                    const value = promptInput ? promptInput.value : '';
                    cleanup();
                    resolve(value);
                };
            }
            
            if (promptCancel) {
                promptCancel.onclick = () => {
                    this.modal.style.display = 'none';
                    cleanup();
                    resolve(null);
                };
            }
            
            if (promptInput) {
                promptInput.focus();
            }
        });
    }
    
    handleOk() {
        console.log('[ModalSystem] handleOk called');
        if (this.modal) this.modal.style.display = 'none';
        if (this.currentResolve) {
            this.currentResolve(true);
            this.currentResolve = null;
        }
    }
    
    handleCancel() {
        console.log('[ModalSystem] handleCancel called');
        if (this.modal) this.modal.style.display = 'none';
        if (this.currentResolve) {
            this.currentResolve(false);
            this.currentResolve = null;
        }
    }
}

// Global modal system instance
let modalSystem = null;

// ==========================================
// SECURE BROWSER CLASS
// ==========================================
class SecureBrowser {
    constructor() {
        this.tabs = [];
        this.activeTabIndex = 0;
        this.bookmarks = {};
        this.history = [];
        this.sidebarCollapsed = true;
        this.currentPanel = null;
        
        this.init();
    }
    
    async init() {
        console.log('[SecureBrowser] Initializing secure browser...');
        
        // Initialize modal system
        modalSystem = new ModalSystem();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadBookmarks();
        await this.loadHistory();
        await this.loadSidebarConfig();
        
        // Setup password panel close button
        const closePasswordBtn = document.getElementById('close-password-panel');
        if (closePasswordBtn) {
            closePasswordBtn.addEventListener('click', () => {
                this.togglePasswordPanel();
            });
        }
        
        // Setup Web3 panel close button
        const closeWeb3Btn = document.getElementById('close-web3-panel');
        if (closeWeb3Btn) {
            closeWeb3Btn.addEventListener('click', () => {
                this.toggleWeb3Panel();
            });
        }
        
        // Listen for messages from wizard iframe
        window.addEventListener('message', (event) => {
            if (event.data.type === 'openWalletPanel') {
                console.log('[SecureBrowser] Received openWalletPanel message');
                
                // Open the Web3 wallet panel (right panel)
                this.toggleWeb3Panel();
                
                // If we should highlight the create button
                if (event.data.highlightCreateButton) {
                    setTimeout(() => {
                        // Target the correct create wallet button in the right panel
                        const createBtn = document.getElementById('create-wallet-right');
                        if (createBtn) {
                            console.log('[SecureBrowser] Adding pulse highlight to create wallet button');
                            createBtn.classList.add('pulse-highlight');
                            
                            // Remove highlight after 10 seconds
                            setTimeout(() => {
                                createBtn.classList.remove('pulse-highlight');
                            }, 10000);
                        } else {
                            console.warn('[SecureBrowser] Create wallet button not found in right panel');
                        }
                    }, 500); // Wait for panel to open
                }
            } else if (event.data.type === 'closeWizardTab') {
                console.log('[SecureBrowser] Received closeWizardTab message');
                // Find and close the wizard tab
                const wizardTab = Array.from(document.querySelectorAll('.tab')).find(tab => 
                    tab.textContent.includes('Welcome') || tab.querySelector('webview[src*="wizard"]')
                );
                if (wizardTab) {
                    const tabId = wizardTab.dataset.tabId;
                    this.closeTab(tabId);
                }
            }
        });
        
        // Check if this is the first time running the browser
        // DEV MODE: Force show wizard for testing
        const isDev = true; // Set to false for production
        const wizardCompleted = localStorage.getItem('wizardCompleted');
        
        if (isDev || !wizardCompleted) {
            // Dev mode or first time user - show the welcome wizard
            this.createTab('welcome-wizard.html');
            
            // Add a dev mode indicator
            if (isDev) {
                console.log('[DEV MODE] Forcing welcome wizard display for testing');
            }
        } else {
            // Returning user - show landing page
            this.createTab('landing.html');
        }
        
        console.log('[SecureBrowser] Secure browser initialized');
    }
    
    setupEventListeners() {
        console.log('[SecureBrowser] Setting up event listeners...');
        
        // Window controls
        const minimizeBtn = document.getElementById('minimize-button');
        const maximizeBtn = document.getElementById('maximize-button');
        const closeBtn = document.getElementById('close-button');
        
        console.log('[SecureBrowser] Window controls:', { minimizeBtn, maximizeBtn, closeBtn });
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                console.log('[SecureBrowser] Minimize clicked');
                if (typeof ebAPI !== 'undefined') {
                    ebAPI.window.control('minimize');
                } else {
                    console.warn('[SecureBrowser] ebAPI not available for minimize');
                }
            });
        }
        
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                console.log('[SecureBrowser] Maximize clicked');
                if (typeof ebAPI !== 'undefined') {
                    ebAPI.window.control('maximize');
                } else {
                    console.warn('[SecureBrowser] ebAPI not available for maximize');
                }
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[SecureBrowser] Close clicked');
                if (typeof ebAPI !== 'undefined') {
                    ebAPI.window.control('close');
                } else {
                    console.warn('[SecureBrowser] ebAPI not available for close');
                }
            });
        }
        
        // Navigation controls
        const backBtn = document.getElementById('back-button');
        const forwardBtn = document.getElementById('forward-button');
        const refreshBtn = document.getElementById('refresh-button');
        const homeBtn = document.getElementById('home-button');
        const urlBar = document.getElementById('url-bar');
        const goBtn = document.getElementById('go-button');
        
        console.log('[SecureBrowser] Navigation controls:', { backBtn, forwardBtn, refreshBtn, homeBtn, urlBar, goBtn });
        
        if (backBtn) {
            backBtn.addEventListener('click', () => this.goBack());
        }
        
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => this.goForward());
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }
        
        if (homeBtn) {
            homeBtn.addEventListener('click', () => this.navigateToUrl('landing.html'));
        }
        
        // DevTools button
        const devtoolsBtn = document.getElementById('devtools-button');
        if (devtoolsBtn) {
            devtoolsBtn.addEventListener('click', () => this.toggleDevTools());
        }
        
        if (urlBar) {
            urlBar.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.navigateToUrl(urlBar.value);
                }
            });
        }
        
        if (goBtn) {
            goBtn.addEventListener('click', () => {
                if (urlBar) {
                    this.navigateToUrl(urlBar.value);
                }
            });
        }
        
        // Bookmark button
        const bookmarkBtn = document.getElementById('bookmark-button');
        if (bookmarkBtn) {
            bookmarkBtn.addEventListener('click', () => this.toggleBookmarkDropdown());
        }
        
        // New tab button
        const newTabBtn = document.getElementById('new-tab-button');
        if (newTabBtn) {
            newTabBtn.addEventListener('click', () => this.createTab());
        }
        
        // Sidebar controls
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        // Panel buttons
        const bookmarksToggle = document.getElementById('toggle-bookmarks');
        const historyToggle = document.getElementById('toggle-history');
        const web3Toggle = document.getElementById('toggle-web3');
        
        if (bookmarksToggle) {
            bookmarksToggle.addEventListener('click', () => this.togglePanel('bookmarks'));
        }
        
        if (historyToggle) {
            historyToggle.addEventListener('click', () => this.togglePanel('history'));
        }
        
        if (web3Toggle) {
            web3Toggle.addEventListener('click', () => this.togglePanel('web3'));
        }
        
        // Settings and other controls
        this.setupWeb3Panel();
        this.setupSettingsPanel();
        
        // IPC event listeners
        ebAPI.on('bookmarks', (event, bookmarks) => {
            this.bookmarks = bookmarks;
            this.updateBookmarksPanel();
            this.updateFavoritesBar();
        });
        
        ebAPI.on('history', (event, history) => {
            this.history = history;
            this.updateHistoryPanel();
        });
        
        ebAPI.on('menu-new-tab', () => {
            this.createTab();
        });
        
        ebAPI.on('menu-close-tab', () => {
            this.closeTab(this.activeTabIndex);
        });
        
        ebAPI.on('menu-open-url', (event, url) => {
            this.navigateToUrl(url);
        });
        
        ebAPI.on('show-web3-panel', () => {
            this.showWeb3Panel();
        });
        
        ebAPI.on('show-web3-panel-unlock', () => {
            this.showWeb3PanelUnlock();
        });
        
        ebAPI.on('devtools-toggle-requested', () => {
            this.toggleDevTools();
        });
    }
    
    // ==========================================
    // TAB MANAGEMENT
    // ==========================================
    createTab(url = 'landing.html') {
        const tabsContainer = document.getElementById('tabs-container');
        if (!tabsContainer) return;
        
        const tabId = `tab-${Date.now()}`;
        const webviewId = `webview-${Date.now()}`;
        
        // Create tab button
        const tabButton = document.createElement('button');
        tabButton.className = 'tab';
        tabButton.id = tabId;
        tabButton.innerHTML = `
            <span class="tab-title">New Tab</span>
            <button class="tab-close" onclick="browser.closeTab(${this.tabs.length})">×</button>
        `;
        
        // Create webview
        const webviewContainer = document.querySelector('.webview-wrapper');
        if (!webviewContainer) {
            console.error('[SecureBrowser] Webview container not found!');
            return null;
        }
        
        const webview = document.createElement('webview');
        webview.id = webviewId;
        webview.className = 'webview';
        
        // Set webview source - simpler approach
        webview.src = url;
        console.log('[SecureBrowser] Setting webview src to:', url);
        
        // Set webview attributes for desktop experience
        webview.setAttribute('webpreferences', 'contextIsolation=false,nodeIntegration=true,sandbox=false');
        webview.setAttribute('useragent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        webview.setAttribute('partition', 'persist:webview');
        webview.setAttribute('allowpopups', 'true');
        webview.setAttribute('autosize', 'on');
        
        // Add additional attributes to help with iframe height
        webview.setAttribute('disablewebsecurity', 'true');
        webview.setAttribute('nodeintegration', 'true');
        
        console.log('[SecureBrowser] Created webview with src:', webview.src);
        
        // Set proper dimensions for desktop view  
        webview.style.minWidth = '900px';
        webview.style.minHeight = '600px';
        webview.style.width = '100%';
        webview.style.height = '100%';
        webview.style.flex = '1';
        webview.style.display = 'none';
        
        // Set up webview event listeners
        webview.addEventListener('dom-ready', () => {
            console.log('[Tab] Webview dom-ready:', url);
            
            // Fix the webview's internal shadow root iframe
            const fixShadowRoot = () => {
                try {
                    // The webview creates an internal iframe - we need to style it
                    const computedStyle = window.getComputedStyle(webview);
                    const height = computedStyle.height;
                    
                    // Try to access shadow root
                    if (webview.shadowRoot) {
                        const iframe = webview.shadowRoot.querySelector('iframe');
                        if (iframe) {
                            iframe.style.height = '100%';
                            iframe.style.width = '100%';
                            iframe.style.flex = '1 1 auto';
                            console.log('[Tab] Fixed shadow root iframe');
                        }
                    }
                    
                    // Also ensure the webview itself has proper dimensions
                    if (webview.style.display !== 'none') {
                        webview.style.height = '100%';
                        webview.style.width = '100%';
                    }
                } catch (e) {
                    console.log('[Tab] Shadow root fix attempt:', e.message);
                }
            };
            
            // Try multiple times to ensure it sticks
            setTimeout(fixShadowRoot, 100);
            setTimeout(fixShadowRoot, 500);
            setTimeout(fixShadowRoot, 1000);
        });
        
        webview.addEventListener('did-start-loading', () => {
            console.log('[Tab] Webview started loading:', url);
        });
        
        // Add message listener for iframe height fix requests
        webview.addEventListener('ipc-message', (event) => {
            // Handle other IPC messages as needed
        });
        
        webview.addEventListener('did-finish-load', () => {
            console.log('[Tab] Webview finished loading:', url);
            // Removed iframe fix - it was interfering with natural viewport behavior
            
            // Removed CSS injection - it was interfering with natural viewport behavior
        });
        
        webview.addEventListener('did-fail-load', (e) => {
            console.error('[Tab] Webview failed to load:', e.errorDescription, 'code:', e.errorCode, 'url:', e.validatedURL);
        });
        
        webview.addEventListener('did-navigate', (e) => {
            console.log('[Tab] Webview navigated to:', e.url);
            
            // Update the tab's stored URL
            const tabIndex = this.tabs.findIndex(t => t.webview === webview);
            if (tabIndex !== -1) {
                this.tabs[tabIndex].url = e.url;
            }
            
            this.updateUrlBar(e.url);
            this.updateTabTitle(this.tabs.length, e.url);
            
            // Only add to history if it's not the landing page
            if (!e.url.includes('landing.html')) {
                ebAPI.history.add(e.url);
            }
            
            // Removed iframe fix after navigation
        });
        
        webview.addEventListener('page-title-updated', (e) => {
            console.log('[Tab] Webview title updated:', e.title);
            this.updateTabTitle(this.tabs.length, null, e.title);
        });
        
        // Add to tabs array
        const tab = {
            id: tabId,
            webviewId: webviewId,
            button: tabButton,
            webview: webview,
            url: url,
            title: 'New Tab'
        };
        
        this.tabs.push(tab);
        
        // Add to DOM
        if (tabsContainer) {
            tabsContainer.appendChild(tabButton);
        } else {
            console.error('[SecureBrowser] Tabs container not found!');
        }
        
        webviewContainer.appendChild(webview);
        console.log('[SecureBrowser] Webview added to container');
        
        // Set up tab click listener
        tabButton.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchTab(this.tabs.length - 1);
            }
        });
        
        // Switch to new tab
        console.log('[SecureBrowser] Switching to tab:', this.tabs.length - 1);
        this.switchTab(this.tabs.length - 1);
        
        console.log('[SecureBrowser] Tab created successfully:', tab);
        return tab;
    }
    
    
    switchTab(index) {
        console.log('[SecureBrowser] switchTab called with index:', index, 'total tabs:', this.tabs.length);
        
        if (index < 0 || index >= this.tabs.length) {
            console.warn('[SecureBrowser] Invalid tab index:', index);
            return;
        }
        
        // Hide current tab
        if (this.tabs[this.activeTabIndex]) {
            console.log('[SecureBrowser] Hiding current tab:', this.activeTabIndex);
            this.tabs[this.activeTabIndex].webview.style.display = 'none';
            this.tabs[this.activeTabIndex].webview.classList.remove('active');
            this.tabs[this.activeTabIndex].button.classList.remove('active');
        }
        
        // Show new tab
        this.activeTabIndex = index;
        const activeTab = this.tabs[this.activeTabIndex];
        console.log('[SecureBrowser] Showing tab:', index, 'webview src:', activeTab.webview.src);
        activeTab.webview.style.display = 'block';
        activeTab.webview.style.flex = '1';
        activeTab.webview.style.width = '100%';
        activeTab.webview.style.height = '100%';
        activeTab.webview.classList.add('active');
        activeTab.button.classList.add('active');
        
        // Removed iframe fix on tab switch
        
        // Update URL bar
        this.updateUrlBar(activeTab.url);
        
        console.log('[SecureBrowser] Tab switched successfully to index:', index);
    }
    
    closeTab(index) {
        if (index < 0 || index >= this.tabs.length || this.tabs.length === 1) return;
        
        const tab = this.tabs[index];
        
        // Remove from DOM
        if (tab.button && tab.button.parentNode) {
            tab.button.parentNode.removeChild(tab.button);
        }
        if (tab.webview && tab.webview.parentNode) {
            tab.webview.parentNode.removeChild(tab.webview);
        }
        
        // Remove from array
        this.tabs.splice(index, 1);
        
        // Adjust active tab index
        if (this.activeTabIndex >= index && this.activeTabIndex > 0) {
            this.activeTabIndex--;
        }
        
        // Switch to active tab
        if (this.tabs.length > 0) {
            this.switchTab(this.activeTabIndex);
        }
    }
    
    updateTabTitle(index, url, title) {
        if (index < 0 || index >= this.tabs.length) return;
        
        const tab = this.tabs[index];
        if (url) tab.url = url;
        if (title) tab.title = title;
        
        const displayTitle = tab.title || tab.url || 'New Tab';
        const tabTitleSpan = tab.button.querySelector('.tab-title');
        if (tabTitleSpan) {
            tabTitleSpan.textContent = displayTitle.length > 20 ? displayTitle.substring(0, 20) + '...' : displayTitle;
        }
    }
    
    // ==========================================
    // NAVIGATION
    // ==========================================
    navigateToUrl(url) {
        if (!url || typeof url !== 'string') return;
        
        // Clean up URL
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            if (url.includes('.') || url.includes(':')) {
                url = 'https://' + url;
            } else {
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }
        
        const activeTab = this.tabs[this.activeTabIndex];
        if (activeTab && activeTab.webview) {
            activeTab.webview.src = url;
            activeTab.url = url;
            this.updateUrlBar(url);
        }
    }
    
    goBack() {
        const activeTab = this.tabs[this.activeTabIndex];
        if (activeTab && activeTab.webview && activeTab.webview.canGoBack()) {
            activeTab.webview.goBack();
        }
    }
    
    goForward() {
        const activeTab = this.tabs[this.activeTabIndex];
        if (activeTab && activeTab.webview && activeTab.webview.canGoForward()) {
            activeTab.webview.goForward();
        }
    }
    
    refresh() {
        const activeTab = this.tabs[this.activeTabIndex];
        if (activeTab && activeTab.webview) {
            activeTab.webview.reload();
        }
    }
    
    updateUrlBar(url) {
        const urlBar = document.getElementById('url-bar');
        const urlLock = document.getElementById('url-lock');
        
        if (urlBar) {
            // Check if it's the landing page or any local file
            if (url && url.includes('landing.html')) {
                urlBar.value = 'Home of The Everything Black Browser';
                // Update lock icon to home icon
                if (urlLock) {
                    urlLock.innerHTML = '<i class="fas fa-home"></i>';
                    urlLock.style.color = '#f78513';
                }
            } else if (url && url.startsWith('file://')) {
                // For other local files, extract just the filename
                const filename = url.split('/').pop().split('.')[0];
                urlBar.value = filename.charAt(0).toUpperCase() + filename.slice(1);
                if (urlLock) {
                    urlLock.innerHTML = '<i class="fas fa-file"></i>';
                    urlLock.style.color = '#f78513';
                }
            } else {
                urlBar.value = url || '';
                // Update lock icon based on protocol
                if (urlLock) {
                    if (url && url.startsWith('https://')) {
                        urlLock.innerHTML = '<i class="fas fa-lock"></i>';
                        urlLock.style.color = '#4CAF50';
                    } else {
                        urlLock.innerHTML = '<i class="fas fa-info-circle"></i>';
                        urlLock.style.color = '#FF9800';
                    }
                }
            }
        }
    }
    
    // ==========================================
    // BOOKMARKS
    // ==========================================
    async loadBookmarks() {
        try {
            ebAPI.bookmarks.get();
        } catch (error) {
            console.error('[SecureBrowser] Error loading bookmarks:', error);
        }
    }
    
    toggleBookmarkDropdown() {
        const dropdown = document.getElementById('bookmark-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
        
        // Set current URL and title
        const nameInput = document.getElementById('bookmark-name');
        const activeTab = this.tabs[this.activeTabIndex];
        
        if (nameInput && activeTab) {
            nameInput.value = activeTab.title || activeTab.url || '';
        }
        
        // Set up add button
        const addBtn = document.getElementById('add-bookmark-btn');
        if (addBtn) {
            addBtn.onclick = () => this.addBookmark();
        }
    }
    
    addBookmark() {
        const nameInput = document.getElementById('bookmark-name');
        const folderSelect = document.getElementById('bookmark-folder');
        const activeTab = this.tabs[this.activeTabIndex];
        
        if (!nameInput || !folderSelect || !activeTab) return;
        
        const bookmark = {
            name: nameInput.value || activeTab.title || activeTab.url,
            url: activeTab.url
        };
        
        ebAPI.bookmarks.add(folderSelect.value, bookmark);
        
        // Hide dropdown
        const dropdown = document.getElementById('bookmark-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
    
    updateBookmarksPanel() {
        const panel = document.getElementById('bookmarks-panel');
        if (!panel) return;
        
        panel.innerHTML = '<h3>Bookmarks</h3>';
        
        Object.keys(this.bookmarks).forEach(folder => {
            if (this.bookmarks[folder].length > 0) {
                const folderDiv = document.createElement('div');
                folderDiv.className = 'bookmark-folder';
                folderDiv.innerHTML = `<h4>${folder.replace('-', ' ').toUpperCase()}</h4>`;
                
                this.bookmarks[folder].forEach(bookmark => {
                    const bookmarkDiv = document.createElement('div');
                    bookmarkDiv.className = 'bookmark-item';
                    bookmarkDiv.innerHTML = `
                        <a href="#" onclick="browser.navigateToUrl('${bookmark.url}')">${bookmark.name}</a>
                        <button onclick="browser.removeBookmark('${bookmark.url}')">×</button>
                    `;
                    folderDiv.appendChild(bookmarkDiv);
                });
                
                panel.appendChild(folderDiv);
            }
        });
    }
    
    updateFavoritesBar() {
        const favoritesBar = document.getElementById('favorites-bar');
        if (!favoritesBar) return;
        
        favoritesBar.innerHTML = '';
        
        if (this.bookmarks['favorites-bar']) {
            this.bookmarks['favorites-bar'].forEach(bookmark => {
                const favBtn = document.createElement('button');
                favBtn.className = 'favorites-item';
                favBtn.textContent = bookmark.name;
                favBtn.onclick = () => this.navigateToUrl(bookmark.url);
                favoritesBar.appendChild(favBtn);
            });
        }
    }
    
    removeBookmark(url) {
        ebAPI.bookmarks.remove(url);
    }
    
    // ==========================================
    // HISTORY
    // ==========================================
    async loadHistory() {
        try {
            ebAPI.history.get();
        } catch (error) {
            console.error('[SecureBrowser] Error loading history:', error);
        }
    }
    
    updateHistoryPanel() {
        const panel = document.getElementById('history-panel');
        if (!panel) return;
        
        panel.innerHTML = `
            <h3>History</h3>
            <button onclick="browser.clearHistory()" class="clear-btn">Clear History</button>
        `;
        
        this.history.slice(0, 50).forEach(item => {
            const historyDiv = document.createElement('div');
            historyDiv.className = 'history-item';
            
            // Clean up the display URL for history
            let displayText = item.url;
            if (item.url.includes('landing.html')) {
                displayText = 'Home of The Everything Black Browser';
            } else if (item.url.startsWith('file://')) {
                // For local files, show a clean name
                const filename = item.url.split('/').pop().split('.')[0];
                displayText = filename.charAt(0).toUpperCase() + filename.slice(1).replace(/-/g, ' ');
            } else if (item.url.length > 50) {
                // Truncate long URLs
                displayText = item.url.substring(0, 47) + '...';
            }
            
            historyDiv.innerHTML = `
                <a href="#" onclick="browser.navigateToUrl('${item.url}')" title="${item.url}">${displayText}</a>
                <span class="history-time">${new Date(item.timestamp).toLocaleString()}</span>
            `;
            panel.appendChild(historyDiv);
        });
    }
    
    clearHistory() {
        if (modalSystem) {
            modalSystem.confirm('Are you sure you want to clear your browsing history?').then(confirmed => {
                if (confirmed) {
                    ebAPI.history.clear();
                }
            });
        }
    }
    
    // ==========================================
    // SIDEBAR
    // ==========================================
    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        }
    }
    
    togglePanel(panelName) {
        if (!this.sidebarCollapsed) {
            if (this.currentPanel === panelName) {
                this.toggleSidebar();
                return;
            }
        } else {
            this.toggleSidebar();
        }
        
        this.currentPanel = panelName;
        this.showPanel(panelName);
    }
    
    showPanel(panelName) {
        const panels = ['bookmarks-panel', 'history-panel', 'web3-panel', 'password-panel'];
        panels.forEach(panel => {
            const el = document.getElementById(panel);
            if (el) {
                // Handle special case for passwords panel
                const targetPanel = panelName === 'passwords' ? 'password-panel' : `${panelName}-panel`;
                el.style.display = panel === targetPanel ? 'block' : 'none';
            }
        });
        
        // Handle iframe for password panel
        if (panelName === 'passwords') {
            const passwordPanel = document.getElementById('password-panel');
            if (passwordPanel) {
                passwordPanel.style.display = 'block';
            }
            const passwordIframe = document.getElementById('password-iframe');
            if (passwordIframe && !passwordIframe.src) {
                passwordIframe.src = 'password-manager.html';
            }
        }
        
        const buttons = ['toggle-bookmarks', 'toggle-history', 'toggle-web3', 'toggle-passwords'];
        buttons.forEach(button => {
            const el = document.getElementById(button);
            if (el) {
                el.classList.toggle('active', button === `toggle-${panelName}`);
            }
        });
    }
    
    // ==========================================
    // WEB3 PANEL
    // ==========================================
    async setupWeb3Panel() {
        console.log('[SecureBrowser] Setting up Web3 panel...');
        
        // Check if password exists
        const hasPassword = await ebAPI.password.checkExists();
        console.log('[Web3Panel] Has password:', hasPassword);
        
        if (hasPassword) {
            // Check if wallet is unlocked
            const isUnlocked = await ebAPI.password.checkUnlocked();
            console.log('[Web3Panel] Is unlocked:', isUnlocked);
            
            if (isUnlocked) {
                await this.showWalletInterface();
            } else {
                this.showPasswordLockScreen();
            }
        } else {
            this.showWalletSetup();
        }
    }
    
    showWalletSetup() {
        const walletSection = document.getElementById('wallet-setup-section');
        const lockedSection = document.getElementById('wallet-locked-section');
        const interfaceSection = document.getElementById('wallet-interface-section');
        
        if (walletSection) walletSection.style.display = 'block';
        if (lockedSection) lockedSection.style.display = 'none';
        if (interfaceSection) interfaceSection.style.display = 'none';
        
        // Set up wallet creation buttons
        const createBtn = document.getElementById('create-wallet-btn');
        const restoreBtn = document.getElementById('restore-wallet-btn');
        
        if (createBtn) {
            createBtn.onclick = () => this.createWallet();
        }
        
        if (restoreBtn) {
            restoreBtn.onclick = () => this.restoreWallet();
        }
    }
    
    showPasswordLockScreen() {
        const walletSection = document.getElementById('wallet-setup-section');
        const lockedSection = document.getElementById('wallet-locked-section');
        const interfaceSection = document.getElementById('wallet-interface-section');
        
        if (walletSection) walletSection.style.display = 'none';
        if (lockedSection) lockedSection.style.display = 'block';
        if (interfaceSection) interfaceSection.style.display = 'none';
        
        // Set up unlock button
        const unlockBtn = document.getElementById('unlock-wallet-btn');
        if (unlockBtn) {
            unlockBtn.onclick = () => this.unlockWallet();
        }
    }
    
    async showWalletInterface() {
        const walletSection = document.getElementById('wallet-setup-section');
        const lockedSection = document.getElementById('wallet-locked-section');
        const interfaceSection = document.getElementById('wallet-interface-section');
        
        if (walletSection) walletSection.style.display = 'none';
        if (lockedSection) lockedSection.style.display = 'none';
        if (interfaceSection) interfaceSection.style.display = 'block';
        
        // Load wallet data
        await this.loadWalletData();
        
        // Set up interface buttons
        this.setupWalletInterfaceButtons();
    }
    
    async createWallet() {
        if (!modalSystem) return;
        
        const password = await modalSystem.prompt('Enter a password to secure your wallet (minimum 8 characters):');
        if (!password || password.length < 8) {
            await modalSystem.alert('Password must be at least 8 characters long.');
            return;
        }
        
        const confirmPassword = await modalSystem.prompt('Confirm your password:');
        if (password !== confirmPassword) {
            await modalSystem.alert('Passwords do not match.');
            return;
        }
        
        try {
            // Set password
            const passwordResult = await ebAPI.password.set(password);
            if (!passwordResult.success) {
                await modalSystem.alert('Error setting password: ' + passwordResult.error);
                return;
            }
            
            // Generate wallet
            const walletResult = await ebAPI.wallet.generate();
            if (!walletResult.success) {
                await modalSystem.alert('Error creating wallet: ' + walletResult.error);
                return;
            }
            
            await modalSystem.alert('Wallet created successfully! Make sure to back up your seed phrase.');
            await this.showWalletInterface();
            
        } catch (error) {
            console.error('[Web3Panel] Create wallet error:', error);
            await modalSystem.alert('Error creating wallet: ' + error.message);
        }
    }
    
    async restoreWallet() {
        if (!modalSystem) return;
        
        const mnemonic = await modalSystem.prompt('Enter your 12 or 24 word seed phrase:');
        if (!mnemonic) return;
        
        const password = await modalSystem.prompt('Enter a password to secure your wallet (minimum 8 characters):');
        if (!password || password.length < 8) {
            await modalSystem.alert('Password must be at least 8 characters long.');
            return;
        }
        
        const confirmPassword = await modalSystem.prompt('Confirm your password:');
        if (password !== confirmPassword) {
            await modalSystem.alert('Passwords do not match.');
            return;
        }
        
        try {
            // Set password
            const passwordResult = await ebAPI.password.set(password);
            if (!passwordResult.success) {
                await modalSystem.alert('Error setting password: ' + passwordResult.error);
                return;
            }
            
            // Restore wallet
            const walletResult = await ebAPI.wallet.restore(mnemonic);
            if (!walletResult.success) {
                await modalSystem.alert('Error restoring wallet: ' + walletResult.error);
                return;
            }
            
            await modalSystem.alert('Wallet restored successfully!');
            await this.showWalletInterface();
            
        } catch (error) {
            console.error('[Web3Panel] Restore wallet error:', error);
            await modalSystem.alert('Error restoring wallet: ' + error.message);
        }
    }
    
    async unlockWallet() {
        if (!modalSystem) return;
        
        const passwordInput = document.getElementById('unlock-password');
        const password = passwordInput ? passwordInput.value : '';
        
        if (!password) {
            const errorDiv = document.getElementById('unlock-error');
            if (errorDiv) {
                errorDiv.textContent = 'Please enter your password';
            }
            return;
        }
        
        try {
            const result = await ebAPI.password.verify(password);
            if (result.success) {
                await this.showWalletInterface();
            } else {
                const errorDiv = document.getElementById('unlock-error');
                if (errorDiv) {
                    errorDiv.textContent = 'Invalid password';
                }
            }
        } catch (error) {
            console.error('[Web3Panel] Unlock error:', error);
            const errorDiv = document.getElementById('unlock-error');
            if (errorDiv) {
                errorDiv.textContent = 'Error unlocking wallet';
            }
        }
    }
    
    async loadWalletData() {
        try {
            // Load wallet
            const walletResult = await ebAPI.wallet.load();
            if (walletResult.success && walletResult.wallet) {
                const addressEl = document.getElementById('wallet-address');
                if (addressEl) {
                    addressEl.textContent = walletResult.wallet.address;
                }
            }
            
            // Load balance
            const balanceResult = await ebAPI.wallet.getBalance();
            if (balanceResult.success) {
                const balanceEl = document.getElementById('wallet-balance');
                if (balanceEl) {
                    balanceEl.textContent = balanceResult.balance + ' ETH';
                }
            }
            
        } catch (error) {
            console.error('[Web3Panel] Load wallet data error:', error);
        }
    }
    
    setupWalletInterfaceButtons() {
        const sendBtn = document.getElementById('send-btn');
        const lockBtn = document.getElementById('lock-wallet-btn');
        const settingsBtn = document.getElementById('wallet-settings-btn');
        
        if (sendBtn) {
            sendBtn.onclick = () => this.showSendDialog();
        }
        
        if (lockBtn) {
            lockBtn.onclick = () => this.lockWallet();
        }
        
        if (settingsBtn) {
            settingsBtn.onclick = () => this.showWalletSettings();
        }
    }
    
    async showSendDialog() {
        if (!modalSystem) return;
        
        const to = await modalSystem.prompt('Enter recipient address:');
        if (!to) return;
        
        const amount = await modalSystem.prompt('Enter amount in ETH:');
        if (!amount) return;
        
        const confirmed = await modalSystem.confirm(`Send ${amount} ETH to ${to}?`);
        if (!confirmed) return;
        
        try {
            const result = await ebAPI.wallet.sendTransaction({ to, amount });
            if (result.success) {
                await modalSystem.alert('Transaction sent successfully!');
                await this.loadWalletData();
            } else {
                await modalSystem.alert('Transaction failed: ' + result.error);
            }
        } catch (error) {
            console.error('[Web3Panel] Send transaction error:', error);
            await modalSystem.alert('Transaction failed: ' + error.message);
        }
    }
    
    async lockWallet() {
        try {
            await ebAPI.password.lock();
            this.showPasswordLockScreen();
        } catch (error) {
            console.error('[Web3Panel] Lock wallet error:', error);
        }
    }
    
    showWalletSettings() {
        // Show wallet settings dialog
        console.log('[Web3Panel] Show wallet settings...');
    }
    
    showWeb3Panel() {
        this.togglePanel('web3');
        if (this.currentPanel !== 'web3') {
            this.showPanel('web3');
        }
    }
    
    showWeb3PanelUnlock() {
        this.showWeb3Panel();
        this.showPasswordLockScreen();
    }
    
    // ==========================================
    // SETTINGS PANEL
    // ==========================================
    setupSettingsPanel() {
        // Set up settings if panel exists
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            console.log('[SecureBrowser] Settings panel available');
        }
    }
    
    // ==========================================
    // SIDEBAR CONFIG
    // ==========================================
    async loadSidebarConfig() {
        try {
            const result = await ebAPI.sidebarConfig.load();
            if (result.success && result.data) {
                console.log('[SecureBrowser] Sidebar config loaded:', result.data);
                // Apply sidebar configuration
                this.applySidebarConfig(result.data);
            }
        } catch (error) {
            console.error('[SecureBrowser] Error loading sidebar config:', error);
        }
    }
    
    applySidebarConfig(config) {
        console.log('[SecureBrowser] Applying sidebar configuration:', config);
        
        // Apply configuration to each button
        if (config.buttons) {
            config.buttons.forEach(buttonConfig => {
                const button = document.getElementById(`toggle-${buttonConfig.id}`);
                if (button) {
                    // Always show the button, but handle disabled state
                    button.style.display = 'flex';
                    
                    // Remove existing click listeners
                    const newButton = button.cloneNode(true);
                    button.parentNode.replaceChild(newButton, button);
                    
                    // Add new click listener based on configuration
                    newButton.addEventListener('click', () => {
                        if (buttonConfig.enabled) {
                            this.handleSidebarButtonClick(buttonConfig);
                        } else {
                            // Show maintenance page for disabled buttons
                            this.showMaintenancePage(buttonConfig.text);
                        }
                    });
                    
                    // Optionally add visual indicator for disabled buttons
                    if (!buttonConfig.enabled) {
                        newButton.style.opacity = '0.5';
                        newButton.title = 'This feature is currently under maintenance';
                    }
                } else {
                    console.log('[SecureBrowser] Button not found for config:', buttonConfig.id);
                }
            });
            
            // Add custom buttons if they exist
            if (config.customButtons) {
                this.addCustomButtons(config.customButtons);
            }
        }
    }
    
    handleSidebarButtonClick(buttonConfig) {
        console.log('[SecureBrowser] Handling sidebar button click:', buttonConfig);
        
        switch (buttonConfig.action) {
            case 'url':
                // Open URL in new tab
                this.createTab(buttonConfig.url);
                break;
            case 'panel':
                // Special handling for password manager and web3 - open right panel
                if (buttonConfig.id === 'passwords') {
                    this.togglePasswordPanel();
                } else if (buttonConfig.id === 'web3') {
                    this.toggleWeb3Panel();
                } else {
                    // Toggle regular left panel
                    this.togglePanel(buttonConfig.id);
                }
                break;
            case 'settings':
                // Toggle settings panel
                this.togglePanel('settings');
                break;
            case 'maintenance':
                // Show maintenance page
                this.showMaintenancePage(buttonConfig.text);
                break;
            default:
                console.log('[SecureBrowser] Unknown button action:', buttonConfig.action);
        }
    }
    
    togglePasswordPanel() {
        const rightPanel = document.getElementById('password-right-panel');
        const passwordIframe = document.getElementById('password-iframe');
        
        if (rightPanel) {
            const isOpen = rightPanel.classList.contains('open');
            
            if (isOpen) {
                // Close panel
                rightPanel.classList.remove('open');
                setTimeout(() => {
                    rightPanel.style.display = 'none';
                }, 300); // Wait for animation
            } else {
                // Open panel
                rightPanel.style.display = 'block';
                setTimeout(() => {
                    rightPanel.classList.add('open');
                }, 10); // Small delay for CSS transition
                
                // Load iframe if not loaded
                if (passwordIframe && !passwordIframe.src) {
                    passwordIframe.src = 'password-manager.html';
                }
            }
        }
    }
    
    toggleWeb3Panel() {
        console.log('[SecureBrowser] toggleWeb3Panel called');
        const rightPanel = document.getElementById('web3-right-panel');
        const web3Iframe = document.getElementById('web3-iframe');
        
        if (rightPanel) {
            const isOpen = rightPanel.classList.contains('open');
            console.log('[SecureBrowser] Web3 panel current state:', isOpen ? 'open' : 'closed');
            
            if (isOpen) {
                // Close panel
                console.log('[SecureBrowser] Closing Web3 panel');
                rightPanel.classList.remove('open');
                setTimeout(() => {
                    rightPanel.style.display = 'none';
                }, 300); // Wait for animation
            } else {
                // Open panel
                console.log('[SecureBrowser] Opening Web3 panel');
                rightPanel.style.display = 'block';
                setTimeout(() => {
                    rightPanel.classList.add('open');
                }, 10); // Small delay for CSS transition
                
                // Load iframe if not loaded (Web3 panel doesn't use iframe, so this is optional)
                if (web3Iframe && !web3Iframe.src) {
                    web3Iframe.src = 'web3.html';
                }
            }
        } else {
            console.error('[SecureBrowser] web3-right-panel element not found!');
        }
    }
    
    addCustomButtons(customButtons) {
        // Find the sidebar element
        const sidebar = document.querySelector('.sidebar');
        const web3Panel = document.getElementById('web3-panel');
        
        if (!sidebar || !web3Panel) {
            console.error('[SecureBrowser] Could not find sidebar or insertion point for custom buttons');
            return;
        }
        
        customButtons.forEach(buttonConfig => {
            if (!buttonConfig.enabled) return; // Skip disabled custom buttons
            
            // Create new button element
            const button = document.createElement('button');
            button.id = `toggle-${buttonConfig.id}`;
            button.className = 'sidebar-button';
            button.style.display = 'flex';
            
            button.innerHTML = `
                <span class="icon"><i class="${buttonConfig.icon}"></i></span>
                <span class="text">${buttonConfig.text}</span>
            `;
            
            // Add click handler
            button.addEventListener('click', () => {
                if (buttonConfig.enabled) {
                    this.handleSidebarButtonClick(buttonConfig);
                } else {
                    this.showMaintenancePage(buttonConfig.text);
                }
            });
            
            // Insert after web3 panel
            web3Panel.insertAdjacentElement('afterend', button);
        });
    }
    
    showMaintenancePage(feature = '') {
        const maintenanceUrl = `maintenance.html${feature ? `?feature=${encodeURIComponent(feature)}` : ''}`;
        this.createTab(maintenanceUrl);
    }
    
    // ==========================================
    // DEVTOOLS MANAGEMENT
    // ==========================================
    toggleDevTools() {
        const activeWebview = this.getActiveWebview();
        if (activeWebview) {
            if (activeWebview.isDevToolsOpened()) {
                activeWebview.closeDevTools();
            } else {
                activeWebview.openDevTools();
            }
        }
    }
    
    getActiveWebview() {
        if (this.activeTabIndex >= 0 && this.tabs[this.activeTabIndex]) {
            return this.tabs[this.activeTabIndex].webview;
        }
        return null;
    }
    
    // ==========================================
    // IFRAME HEIGHT FIX
    // ==========================================
    fixWebviewIframeHeight(webview) {
        if (!webview) return;
        
        console.log('[IframeFix] Applying comprehensive iframe height fix...');
        
        // Method 1: Direct JavaScript injection into webview
        webview.executeJavaScript(`
            try {
                console.log('[IframeFix] Starting comprehensive iframe fix...');
                
                // Step 1: Set up document and body for full height
                const html = document.documentElement;
                const body = document.body;
                
                html.style.height = '100%';
                html.style.minHeight = '100%';
                html.style.margin = '0';
                html.style.padding = '0';
                
                body.style.height = '100%';
                body.style.minHeight = '100vh';
                body.style.margin = '0';
                body.style.padding = '0';
                body.style.overflow = 'auto';
                
                // Step 2: Find and fix all iframes
                const iframes = document.querySelectorAll('iframe');
                console.log('[IframeFix] Found ' + iframes.length + ' iframes');
                
                iframes.forEach((iframe, index) => {
                    console.log('[IframeFix] Fixing iframe', index);
                    
                    // Set critical height properties
                    iframe.style.setProperty('height', '100%', 'important');
                    iframe.style.setProperty('min-height', '600px', 'important');
                    iframe.style.setProperty('width', '100%', 'important');
                    iframe.style.setProperty('flex', '1 1 auto', 'important');
                    iframe.style.setProperty('border', '0', 'important');
                    iframe.style.setProperty('margin', '0', 'important');
                    iframe.style.setProperty('padding', '0', 'important');
                    
                    // Ensure parent containers are flexible
                    let parent = iframe.parentElement;
                    let depth = 0;
                    while (parent && depth < 5) {
                        if (parent !== body && parent !== html) {
                            parent.style.height = '100%';
                            parent.style.minHeight = '100%';
                            parent.style.display = parent.style.display || 'block';
                            if (parent.style.display === 'flex') {
                                parent.style.flexDirection = parent.style.flexDirection || 'column';
                            }
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                    
                    // Force browser reflow
                    iframe.offsetHeight;
                });
                
                // Step 3: Handle landing container specifically
                const landingContainer = document.querySelector('.landing-container');
                if (landingContainer) {
                    landingContainer.style.minHeight = '100vh';
                    landingContainer.style.height = 'auto';
                    landingContainer.style.display = 'flex';
                    landingContainer.style.flexDirection = 'column';
                    console.log('[IframeFix] Fixed landing container');
                }
                
                // Step 4: Set up mutation observer for dynamic iframes
                if (typeof window.iframeObserver === 'undefined') {
                    window.iframeObserver = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            mutation.addedNodes.forEach((node) => {
                                if (node.tagName === 'IFRAME') {
                                    console.log('[IframeFix] New iframe detected, applying fix');
                                    setTimeout(() => {
                                        node.style.setProperty('height', '100%', 'important');
                                        node.style.setProperty('min-height', '600px', 'important');
                                        node.style.setProperty('width', '100%', 'important');
                                        node.style.setProperty('flex', '1 1 auto', 'important');
                                        node.offsetHeight;
                                    }, 100);
                                }
                            });
                        });
                    });
                    
                    window.iframeObserver.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
                
                console.log('[IframeFix] Comprehensive iframe fix completed');
                return 'success';
                
            } catch (error) {
                console.error('[IframeFix] Error in comprehensive iframe fix:', error);
                return 'error: ' + error.message;
            }
        `).then(result => {
            console.log('[IframeFix] JavaScript execution result:', result);
        }).catch(err => {
            console.error('[IframeFix] JavaScript execution failed:', err);
            
            // Method 2: Fallback using webview's built-in methods
            this.applyWebviewFallbackFix(webview);
        });
        
        // Method 3: Also try using webContents if available
        try {
            const webContents = webview.getWebContents?.();
            if (webContents) {
                webContents.executeJavaScript(`
                    document.querySelectorAll('iframe').forEach(iframe => {
                        iframe.style.setProperty('height', '100%', 'important');
                        iframe.style.setProperty('min-height', '600px', 'important');
                        iframe.offsetHeight;
                    });
                `).catch(err => console.log('[IframeFix] WebContents fallback failed:', err));
            }
        } catch (err) {
            console.log('[IframeFix] WebContents method not available:', err);
        }
    }
    
    applyWebviewFallbackFix(webview) {
        console.log('[IframeFix] Applying fallback fix...');
        
        // Try multiple timing approaches
        const delays = [100, 250, 500, 1000];
        
        delays.forEach(delay => {
            setTimeout(() => {
                webview.insertCSS(`
                    html, body { 
                        height: 100% !important; 
                        margin: 0 !important; 
                        padding: 0 !important; 
                    }
                    iframe { 
                        height: 100% !important; 
                        min-height: 600px !important;
                        width: 100% !important;
                        flex: 1 1 auto !important;
                        border: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .landing-container {
                        min-height: 100vh !important;
                        height: auto !important;
                        display: flex !important;
                        flex-direction: column !important;
                    }
                `).catch(err => console.log('[IframeFix] CSS insertion failed:', err));
            }, delay);
        });
    }
    
}

// ==========================================
// ETHEREUM PROVIDER (SECURE)
// ==========================================
class SecureEthereumProvider {
    constructor() {
        this.isEB = true;
        this.isMetaMask = false; // Set to false to avoid conflicts
        this.networkVersion = '1';
        this.chainId = '0x1';
        this.selectedAddress = null;
        this.isConnected = () => true;
        
        this.init();
    }
    
    async init() {
        console.log('[EthereumProvider] Initializing secure provider...');
        
        try {
            const accounts = await ebAPI.wallet.getAccounts();
            if (accounts && accounts.length > 0) {
                this.selectedAddress = accounts[0];
            }
        } catch (error) {
            console.error('[EthereumProvider] Init error:', error);
        }
    }
    
    async request(args) {
        console.log('[EthereumProvider] Request:', args);
        
        if (!args || !args.method) {
            throw new Error('Invalid request');
        }
        
        switch (args.method) {
            case 'eth_requestAccounts':
                return await ebAPI.wallet.requestAccounts();
                
            case 'eth_accounts':
                return await ebAPI.wallet.getAccounts();
                
            case 'eth_chainId':
                return this.chainId;
                
            case 'net_version':
                return this.networkVersion;
                
            case 'eth_sendTransaction':
                if (args.params && args.params[0]) {
                    return await ebAPI.wallet.sendTransaction(args.params[0]);
                }
                throw new Error('Invalid transaction parameters');
                
            case 'personal_sign':
                if (args.params && args.params.length >= 2) {
                    return await ebAPI.wallet.personalSign(args.params[0], args.params[1]);
                }
                throw new Error('Invalid sign parameters');
                
            case 'eth_sign':
                if (args.params && args.params.length >= 2) {
                    return await ebAPI.wallet.signMessage(args.params[1], args.params[0]);
                }
                throw new Error('Invalid sign parameters');
                
            default:
                throw new Error(`Method ${args.method} not supported`);
        }
    }
    
    on(eventName, callback) {
        console.log('[EthereumProvider] Event listener added:', eventName);
        // Implement event system if needed
    }
    
    removeListener(eventName, callback) {
        console.log('[EthereumProvider] Event listener removed:', eventName);
        // Implement event system if needed
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
let browser = null;

// Add immediate logging
console.log('[SecureBrowser] Script loading...');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SecureBrowser] DOM loaded, initializing...');
    
    // Check if ebAPI is available
    if (typeof ebAPI === 'undefined') {
        console.error('[SecureBrowser] ebAPI not available! Preload script may not have loaded correctly.');
        // Try to continue anyway for debugging
        console.log('[SecureBrowser] Continuing without ebAPI for debugging...');
    } else {
        console.log('[SecureBrowser] ebAPI available:', ebAPI);
    }
    
    // Initialize secure browser
    browser = new SecureBrowser();
    
    // Initialize Ethereum provider
    if (typeof window !== 'undefined') {
        window.ethereum = new SecureEthereumProvider();
        console.log('[SecureBrowser] Ethereum provider initialized');
    }
    
    // Set up global error handling
    window.addEventListener('error', (event) => {
        console.error('[SecureBrowser] Global error:', event.error);
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[SecureBrowser] Unhandled rejection:', event.reason);
    });
    
    console.log('[SecureBrowser] Initialization complete');
});

// ==========================================
// GLOBAL FUNCTIONS FOR HTML ONCLICK
// ==========================================
window.browser = browser;

// Export for use in HTML
window.SecureBrowser = SecureBrowser;
window.modalSystem = modalSystem;