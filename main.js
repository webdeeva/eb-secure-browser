const { app, BrowserWindow, ipcMain, webContents, dialog, shell, session, clipboard, globalShortcut, protocol, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');
const WalletManager = require('./wallet');
const PasswordManager = require('./passwordManager');
const EBDomainResolver = require('./domain-resolver');
const PasswordVault = require('./password-manager/main/passwordManager'); // Our secure password vault

// Initialize stores immediately but they'll be re-initialized after app is ready
let store = new Store();
let walletManager = new WalletManager();
let passwordManager = new PasswordManager();
let passwordVault = null; // Initialize after app is ready
let vaultManager = null; // Password vault - will be initialized after app is ready
let domainResolver = null; // Will be initialized after app is ready

// Set application name
app.setName('Everything Black');

// Re-initialize stores after app is ready to ensure correct paths
function reinitializeStores() {
    console.log('Re-initializing stores with correct app paths...');
    console.log('App userData path:', app.getPath('userData'));
    console.log('App name:', app.getName());
    
    // Create fresh instances
    store = new Store();
    walletManager = new WalletManager();
    passwordManager = new PasswordManager();
    
    console.log('Stores re-initialized');
}

// Certificate whitelist management
let certificateWhitelist = [];

function loadCertificateWhitelist() {
    try {
        certificateWhitelist = store.get('certificateWhitelist', []);
        
        // Add default whitelisted domains if not already present
        const defaultWhitelist = ['www.everythingblack.tv', 'everythingblack.tv'];
        let updated = false;
        
        defaultWhitelist.forEach(domain => {
            if (!certificateWhitelist.includes(domain)) {
                certificateWhitelist.push(domain);
                updated = true;
            }
        });
        
        if (updated) {
            saveCertificateWhitelist();
        }
        
        console.log('Loaded certificate whitelist:', certificateWhitelist);
    } catch (error) {
        console.error('Error loading certificate whitelist:', error);
        certificateWhitelist = ['www.everythingblack.tv', 'everythingblack.tv'];
    }
}

function saveCertificateWhitelist() {
    try {
        store.set('certificateWhitelist', certificateWhitelist);
        console.log('Saved certificate whitelist');
    } catch (error) {
        console.error('Error saving certificate whitelist:', error);
    }
}

function addToCertificateWhitelist(hostname) {
    if (!certificateWhitelist.includes(hostname)) {
        certificateWhitelist.push(hostname);
        saveCertificateWhitelist();
    }
}

function createApplicationMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CmdOrCtrl+T',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-new-tab');
                    }
                },
                {
                    label: 'New Window',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        createWindow();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Close Tab',
                    accelerator: 'CmdOrCtrl+W',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-close-tab');
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Learn More',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-open-url', 'https://everythingblack.xyz');
                    }
                },
                {
                    label: 'Documentation',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-open-documentation');
                    }
                },
                {
                    label: 'Community Discussions',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-open-url', 'https://everythingblack.xyz/forum');
                    }
                },
                {
                    label: 'Search Issues',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-open-url', 'https://github.com/everythingblack/browser/issues');
                    }
                },
                { type: 'separator' },
                {
                    label: 'About Everything Black Browser',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-about');
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                {
                    label: 'About Everything Black Browser',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.send('menu-about');
                    }
                },
                { type: 'separator' },
                { role: 'services', submenu: [] },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });

        // Remove About from Help menu on macOS
        const helpMenu = template.find(menu => menu.label === 'Help');
        if (helpMenu) {
            helpMenu.submenu = helpMenu.submenu.filter(item => item.label !== 'About Everything Black Browser');
        }
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'Everything Black Browser',
        frame: false,
        titleBarStyle: 'hidden', // Hide title bar
        trafficLightPosition: { x: -100, y: -100 }, // Move native buttons off-screen
        webPreferences: {
            nodeIntegration: false,    // SECURE: Disable Node.js access in renderer
            contextIsolation: true,    // SECURE: Enable context isolation
            // sandbox: true,          // Disabled - was interfering with webview height
            webviewTag: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: true,
            preload: path.join(__dirname, 'preload-secure.js')  // Use secure preload
        }
    });

    // Enable dev tools for webviews
    app.on('web-contents-created', (event, contents) => {
        // Handle page load errors
        contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.log('Page failed to load:', validatedURL, errorCode, errorDescription);
            
            // Don't show error page for certain error codes
            const ignoredErrors = [-3, 0, -27]; // Aborted, success, or user canceled
            if (ignoredErrors.includes(errorCode)) {
                return;
            }
            
            // Load custom error page
            const errorPagePath = path.join(__dirname, 'error-page.html');
            const errorParams = new URLSearchParams({
                url: validatedURL,
                error: errorDescription.replace(/ /g, '_').toUpperCase(),
                message: errorDescription
            });
            
            contents.loadFile(errorPagePath, {
                search: errorParams.toString()
            }).catch(err => {
                console.error('Failed to load error page:', err);
            });
        });

        // Set up context menu for all web contents (including webviews)
        contents.on('context-menu', (event, params) => {
            const contextMenuTemplate = [];
            
            // Add text selection options
            if (params.selectionText) {
                contextMenuTemplate.push(
                    { 
                        label: 'Copy', 
                        accelerator: 'CmdOrCtrl+C',
                        click: () => contents.copy()
                    },
                    { type: 'separator' }
                );
            }
            
            // Add editing options if it's an editable field
            if (params.isEditable) {
                contextMenuTemplate.push(
                    { 
                        label: 'Cut', 
                        accelerator: 'CmdOrCtrl+X',
                        enabled: params.selectionText.length > 0,
                        click: () => contents.cut()
                    },
                    { 
                        label: 'Copy', 
                        accelerator: 'CmdOrCtrl+C',
                        enabled: params.selectionText.length > 0,
                        click: () => contents.copy()
                    },
                    { 
                        label: 'Paste', 
                        accelerator: 'CmdOrCtrl+V',
                        click: () => contents.paste()
                    },
                    { type: 'separator' },
                    { 
                        label: 'Select All', 
                        accelerator: 'CmdOrCtrl+A',
                        click: () => contents.selectAll()
                    }
                );
            }
            
            // Add navigation options
            if (contents.canGoBack() || contents.canGoForward()) {
                if (contextMenuTemplate.length > 0) {
                    contextMenuTemplate.push({ type: 'separator' });
                }
                
                contextMenuTemplate.push(
                    { 
                        label: 'Back', 
                        enabled: contents.canGoBack(),
                        click: () => contents.goBack()
                    },
                    { 
                        label: 'Forward', 
                        enabled: contents.canGoForward(),
                        click: () => contents.goForward()
                    },
                    { 
                        label: 'Reload', 
                        click: () => contents.reload()
                    }
                );
            }
            
            // Add developer tools option
            contextMenuTemplate.push(
                { type: 'separator' },
                { 
                    label: 'Inspect Element', 
                    click: () => {
                        const openDevToolsWithFocus = () => {
                            // Open DevTools detached for better window control
                            contents.openDevTools({ mode: 'detach', activate: true });
                            
                            // Wait for DevTools to open and then manage the window
                            const handleDevToolsOpened = () => {
                                setTimeout(() => {
                                    if (contents.devToolsWebContents) {
                                        // Inspect the element first
                                        contents.inspectElement(params.x, params.y);
                                        
                                        // Then handle window focusing
                                        const allWindows = BrowserWindow.getAllWindows();
                                        const devToolsWindow = allWindows.find(win => 
                                            win.webContents === contents.devToolsWebContents
                                        );
                                        
                                        if (devToolsWindow) {
                                            // Force the window to front with stronger settings
                                            devToolsWindow.setAlwaysOnTop(true, 'screen-saver');
                                            devToolsWindow.setVisibleOnAllWorkspaces(true);
                                            devToolsWindow.focus();
                                            devToolsWindow.show();
                                            devToolsWindow.moveTop();
                                            
                                            // Keep it on top for longer
                                            setTimeout(() => {
                                                devToolsWindow.setAlwaysOnTop(true, 'floating');
                                                setTimeout(() => {
                                                    devToolsWindow.setAlwaysOnTop(false);
                                                    devToolsWindow.setVisibleOnAllWorkspaces(false);
                                                }, 3000);
                                            }, 1000);
                                        }
                                    }
                                }, 100);
                            };
                            
                            if (contents.isDevToolsOpened()) {
                                handleDevToolsOpened();
                            } else {
                                contents.once('devtools-opened', handleDevToolsOpened);
                            }
                        };
                        
                        // If DevTools are already open, close and reopen
                        if (contents.isDevToolsOpened()) {
                            contents.closeDevTools();
                            setTimeout(openDevToolsWithFocus, 150);
                        } else {
                            openDevToolsWithFocus();
                        }
                    }
                }
            );
            
            // Only show menu if there are items
            if (contextMenuTemplate.length > 0) {
                const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);
                contextMenu.popup();
            }
        });
        
        if (contents.getType() === 'webview') {
            contents.on('dom-ready', () => {
                contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
            });
            
            contents.on('devtools-opened', () => {
                // Enhanced DevTools focus handling
                setTimeout(() => {
                    if (contents.devToolsWebContents) {
                        contents.devToolsWebContents.focus();
                        
                        // Find and manage the DevTools window
                        const allWindows = BrowserWindow.getAllWindows();
                        const devToolsWindow = allWindows.find(win => 
                            win.webContents === contents.devToolsWebContents
                        );
                        
                        if (devToolsWindow) {
                            devToolsWindow.moveTop();
                            devToolsWindow.focus();
                            devToolsWindow.show();
                            
                            // Ensure it's always on top temporarily
                            devToolsWindow.setAlwaysOnTop(true);
                            setTimeout(() => {
                                devToolsWindow.setAlwaysOnTop(false);
                            }, 1000);
                        }
                    }
                }, 300);
            });
        }
        
        // Handle new window requests from any webview or window
        contents.setWindowOpenHandler(({ url, frameName, features }) => {
            console.log('Window open handler:', url);
            
            // ALL external links should be branded
            if (url && url.startsWith('http')) {
                console.log('Creating branded window for URL:', url);
                
                // Determine title based on URL
                let windowTitle = 'Everything Black';
                if (url.includes('partnerships')) {
                    windowTitle = 'EB Partnership Opportunities';
                } else if (url.includes('everythingblack.xyz')) {
                    windowTitle = 'Everything Black';
                }
                
                // Create branded window with secure settings
                const brandedWindow = new BrowserWindow({
                    width: 1000,
                    height: 700,
                    minWidth: 600,
                    minHeight: 400,
                    title: windowTitle,
                    icon: path.join(__dirname, 'assets/icon.png'),
                    frame: false,
                    titleBarStyle: 'hidden', // Hide title bar
                    trafficLightPosition: { x: -100, y: -100 }, // Move native buttons off-screen
                    webPreferences: {
                        nodeIntegration: false,    // SECURE: Disable Node.js access
                        contextIsolation: true,    // SECURE: Enable context isolation
                        // sandbox: true,          // Disabled - was interfering with webview height
                        webviewTag: true,
                        preload: path.join(__dirname, 'preload-secure.js')
                    },
                    backgroundColor: '#050505',
                    autoHideMenuBar: true
                });
                
                const queryParams = new URLSearchParams({
                    url: url,
                    title: windowTitle
                });
                
                brandedWindow.loadFile('branded-window.html', {
                    search: queryParams.toString()
                });
                
                return { action: 'deny' }; // Prevent default window
            }
            
            // For other URLs, use default behavior
            return { action: 'allow' };
        });
    });

    // Enable dev tools globally
    app.commandLine.appendSwitch('auto-detect-utf8', 'true');
    app.commandLine.appendSwitch('enable-features', 'NetworkService,NetworkServiceInProcess');
    // SECURITY: Removed dangerous certificate bypass switches
    // Only allow insecure localhost for development
    if (process.env.NODE_ENV === 'development') {
        app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
    }

    // Open DevTools for debugging
    mainWindow.webContents.openDevTools();
    
    mainWindow.loadFile('index.html');
    
    // Handle window state
    let windowState = {
        x: undefined,
        y: undefined,
        width: 1280,
        height: 800,
        isMaximized: false
    };

    // Load saved window state
    const savedState = store.get('windowState');
    if (savedState) {
        windowState = savedState;
        mainWindow.setBounds({
            x: windowState.x,
            y: windowState.y,
            width: windowState.width,
            height: windowState.height
        });
        if (windowState.isMaximized) {
            mainWindow.maximize();
        }
    }

    // Save window state on changes
    const saveState = () => {
        if (!mainWindow.isMaximized()) {
            const bounds = mainWindow.getBounds();
            windowState.x = bounds.x;
            windowState.y = bounds.y;
            windowState.width = bounds.width;
            windowState.height = bounds.height;
        }
        windowState.isMaximized = mainWindow.isMaximized();
        store.set('windowState', windowState);
    };

    mainWindow.on('resize', saveState);
    mainWindow.on('move', saveState);
    mainWindow.on('close', saveState);
}

// Chatbot window
let chatbotWindow = null;

function createChatbotWindow() {
    // If chatbot window already exists, focus it
    if (chatbotWindow && !chatbotWindow.isDestroyed()) {
        chatbotWindow.focus();
        return;
    }
    
    chatbotWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        title: 'EB AI Assistant',
        icon: path.join(__dirname, 'assets/icon.png'),
        frame: false,  // Match main window style
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 }, // Move native buttons off-screen
        webPreferences: {
            nodeIntegration: false,    // SECURE: Disable Node.js access
            contextIsolation: true,    // SECURE: Enable context isolation
            // sandbox: true,          // Disabled - was interfering with webview height
            preload: path.join(__dirname, 'preload-secure.js')
        },
        backgroundColor: '#050505',  // Match main window background
        autoHideMenuBar: true
    });

    chatbotWindow.loadFile('chatbot.html');
    
    // Clear reference when window is closed
    chatbotWindow.on('closed', () => {
        chatbotWindow = null;
    });
}

// Handle IPC request to open chatbot
ipcMain.handle('open-chatbot', () => {
    createChatbotWindow();
});

// Handle opening branded windows
ipcMain.handle('open-branded-window', (event, url, options = {}) => {
    const defaultOptions = {
        width: options.width || 1000,
        height: options.height || 700,
        minWidth: 600,
        minHeight: 400,
        title: options.title || 'Everything Black',
        icon: path.join(__dirname, 'assets/icon.png'),
        frame: false,  // Custom frame for branding
        titleBarStyle: 'hidden', // Hide title bar
        trafficLightPosition: { x: -100, y: -100 }, // Move native buttons off-screen
        webPreferences: {
            nodeIntegration: false,    // SECURE: Disable Node.js access
            contextIsolation: true,    // SECURE: Enable context isolation
            // sandbox: true,          // Disabled - was interfering with webview height
            webviewTag: true,
            preload: path.join(__dirname, 'preload-secure.js')
        },
        backgroundColor: '#050505',  // EB background color
        autoHideMenuBar: false
    };
    
    const windowOptions = { ...defaultOptions };
    const brandedWindow = new BrowserWindow(windowOptions);
    
    // Load the branded window with URL and title as query params
    const queryParams = new URLSearchParams({
        url: url,
        title: options.title || 'Everything Black'
    });
    
    brandedWindow.loadFile('branded-window.html', {
        search: queryParams.toString()
    });
    
    return brandedWindow;
});

// Handle bookmarks
const defaultBookmarks = {
    'favorites-bar': [],
    'tech': [],
    'government': [],
    'business': [],
    'social': [],
    'lifestyle': [],
    'family': [],
    'shopping': [],
    'health': [],
    'finance': []
};

let bookmarks = store.get('bookmarks') || defaultBookmarks;

ipcMain.on('add-bookmark', (event, { folder, bookmark }) => {
    if (!bookmarks[folder]) {
        bookmarks[folder] = [];
    }
    
    // Remove bookmark if it exists in any folder
    Object.keys(bookmarks).forEach(f => {
        if (Array.isArray(bookmarks[f])) {
            bookmarks[f] = bookmarks[f].filter(b => b.url !== bookmark.url);
        }
    });
    
    // Add to selected folder
    bookmarks[folder].push(bookmark);
    store.set('bookmarks', bookmarks);
});

ipcMain.on('remove-bookmark', (event, url) => {
    Object.keys(bookmarks).forEach(folder => {
        if (Array.isArray(bookmarks[folder])) {
            bookmarks[folder] = bookmarks[folder].filter(b => b.url !== url);
        }
    });
    store.set('bookmarks', bookmarks);
});

ipcMain.on('get-bookmarks', (event) => {
    event.reply('bookmarks', bookmarks);
});

// Handle history
let history = store.get('history') || [];

ipcMain.on('add-history', (event, url) => {
    history.unshift({
        url,
        timestamp: Date.now()
    });
    history = history.slice(0, 100); // Keep last 100 entries
    store.set('history', history);
});

ipcMain.on('get-history', (event) => {
    event.reply('history', history);
});

ipcMain.on('clear-history', (event) => {
    console.log('[Main] Received clear-history IPC message');
    history = [];
    store.set('history', []);
    console.log('[Main] History cleared, sending reply');
    event.reply('history-cleared');
});

ipcMain.handle('clear-cache', async (event) => {
    console.log('[Main] Received clear-cache IPC message');
    try {
        // Clear all browsing data including cache, cookies, etc.
        await session.defaultSession.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        
        // Also clear cache for webview session
        const webviewSession = session.fromPartition('persist:webview');
        await webviewSession.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        
        return { success: true };
    } catch (error) {
        console.error('Clear cache error:', error);
        return { success: false, error: error.message };
    }
});

// Handle error page navigation
ipcMain.on('reload-page', (event) => {
    const webContents = event.sender;
    webContents.reload();
});

ipcMain.on('go-back', (event) => {
    const webContents = event.sender;
    if (webContents.canGoBack()) {
        webContents.goBack();
    }
});

ipcMain.on('navigate-home', (event) => {
    const webContents = event.sender;
    webContents.loadURL('https://everythingblack.xyz');
});

// Handle clipboard operations
ipcMain.handle('copy-to-clipboard', async (event, text) => {
    try {
        clipboard.writeText(text);
        return { success: true };
    } catch (error) {
        console.error('Clipboard error:', error);
        return { success: false, error: error.message };
    }
});

// Handle file downloads
ipcMain.handle('download-file', async (event, { content, filename }) => {
    try {
        const result = await dialog.showSaveDialog({
            defaultPath: path.join(app.getPath('downloads'), filename),
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePath) {
            await fs.writeFile(result.filePath, content, 'utf8');
            return { success: true, path: result.filePath };
        }
        
        return { success: false, canceled: true };
    } catch (error) {
        console.error('Download error:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(async () => {
    reinitializeStores();
    loadCertificateWhitelist();
    loadConnectedDomains();
    
    // Initialize password vault manager
    try {
        passwordVault = new PasswordVault();
        await passwordVault.initialize();
        console.log('Password vault manager initialized');
    } catch (error) {
        console.error('Failed to initialize password vault:', error);
        // Continue without password vault if it fails
    }
    
    // Initialize domain resolver
    domainResolver = new EBDomainResolver();
    console.log('EB Domain Resolver initialized');
    
    // Create application menu
    createApplicationMenu();
    
    // Configure session for webviews to fix WalletConnect CORS issues
    const webviewSession = session.fromPartition('persist:webview');
    
    // Handle certificate errors for webview session
    webviewSession.setCertificateVerifyProc((request, callback) => {
        const { hostname } = request;
        
        // List of domains to allow despite certificate issues
        const allowedDomains = [
            'www.sheinteractive.com',
            'sheinteractive.com',
            'chat.everythingblack.xyz'
        ];
        
        if (allowedDomains.some(domain => hostname.includes(domain))) {
            callback(0); // 0 means accept
        } else {
            callback(-3); // -3 means use default verification
        }
    });
    
    // Modify headers to fix WalletConnect origin issues
    webviewSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const { url, requestHeaders } = details;
        
        // For WalletConnect relay requests
        if (url.includes('walletconnect.org') || url.includes('walletconnect.com') || 
            url.includes('pulse.walletconnect')) {
            // Set proper origin and referer
            requestHeaders['Origin'] = 'https://domains.everythingblack.xyz';
            requestHeaders['Referer'] = 'https://domains.everythingblack.xyz/';
            
            // Ensure proper user agent
            if (!requestHeaders['User-Agent'] || requestHeaders['User-Agent'].includes('Electron')) {
                requestHeaders['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }
        }
        
        callback({ requestHeaders });
    });
    
    // Handle CORS preflight requests
    webviewSession.webRequest.onHeadersReceived((details, callback) => {
        const { url, responseHeaders } = details;
        
        // For WalletConnect and Web3 related requests
        if (url.includes('walletconnect') || url.includes('pulse.walletconnect') || 
            url.includes('everythingblack.xyz') || url.includes('guapcoinx.com')) {
            responseHeaders['Access-Control-Allow-Origin'] = ['*'];
            responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
            responseHeaders['Access-Control-Allow-Headers'] = ['Content-Type, Authorization, X-Requested-With, X-Client-Id, X-Api-Key'];
            responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
        }
        
        callback({ responseHeaders });
    });
    
    // Set up permissions for webview session
    webviewSession.setPermissionRequestHandler((webContents, permission, callback) => {
        // Allow all permissions for webviews to ensure WalletConnect works
        console.log('Webview permission request:', permission);
        callback(true);
    });
    
    // Intercept navigation requests for EB domains in all webContents
    app.on('web-contents-created', (event, contents) => {
        // Handle will-navigate for standard navigation
        contents.on('will-navigate', async (event, url) => {
            if (domainResolver && domainResolver.isEBDomain(url)) {
                event.preventDefault();
                console.log('EB Domain navigation intercepted:', url);
                
                try {
                    const resolved = await domainResolver.resolveDomain(url);
                    if (resolved && !resolved.error) {
                        const contentUrl = domainResolver.getContentUrl(resolved);
                        console.log('Resolved content URL:', contentUrl);
                        
                        // Determine content type
                        let contentType = 'url';
                        if (resolved.records.ip || resolved.records.ipv4 || resolved.records.ipv6) {
                            contentType = 'ip';
                        } else if (resolved.records.ipfs) {
                            contentType = 'ipfs';
                        }
                        
                        // Load the proxy page with domain masking
                        const proxyPath = path.join(__dirname, 'domain-proxy.html');
                        const proxyParams = new URLSearchParams({
                            domain: resolved.domain,
                            url: contentUrl,
                            type: contentType
                        });
                        
                        // Load proxy page which will maintain the EB domain in address bar
                        contents.loadFile(proxyPath, {
                            search: proxyParams.toString()
                        });
                    } else {
                        console.log('Domain resolution failed:', resolved?.error);
                        // Show error page
                        const errorPagePath = path.join(__dirname, 'error-page.html');
                        const errorParams = new URLSearchParams({
                            url: url,
                            error: 'DOMAIN_NOT_FOUND',
                            message: `The EB domain "${url}" is not registered or could not be resolved.`
                        });
                        contents.loadFile(errorPagePath, {
                            search: errorParams.toString()
                        });
                    }
                } catch (error) {
                    console.error('Domain resolution error:', error);
                    const errorPagePath = path.join(__dirname, 'error-page.html');
                    const errorParams = new URLSearchParams({
                        url: url,
                        error: 'DOMAIN_RESOLUTION_ERROR',
                        message: error.message
                    });
                    contents.loadFile(errorPagePath, {
                        search: errorParams.toString()
                    });
                }
            }
        });
        
        // Also handle new-window events
        contents.setWindowOpenHandler(({ url }) => {
            if (domainResolver && domainResolver.isEBDomain(url)) {
                console.log('EB Domain in new window:', url);
                // Return action: 'deny' to prevent opening, we'll handle it
                return { action: 'deny' };
            }
            return { action: 'allow' };
        });
    });
    
    // Set up clipboard permissions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'].includes(permission)) {
            return callback(true); // Allow clipboard access
        }
        callback(false); // Block other permissions by default
    });
    
    createWindow();
    
    // Register global shortcut for chatbot (Cmd/Ctrl + Shift + A)
    globalShortcut.register('CommandOrControl+Shift+A', () => {
        createChatbotWindow();
    });

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Handle certificate errors with user confirmation
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.log('Certificate error:', url, error);
    
    // Parse the hostname from the URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Auto-allow certain domains
    const autoAllowDomains = [
        'chat.everythingblack.xyz',
        'www.sheinteractive.com',
        'sheinteractive.com'
    ];
    
    if (autoAllowDomains.includes(hostname)) {
        console.log(`Auto-allowing certificate for ${hostname}`);
        event.preventDefault();
        callback(true);
        return;
    }
    
    // Check if this hostname is whitelisted
    if (certificateWhitelist.includes(hostname)) {
        console.log('Certificate whitelisted for:', hostname);
        event.preventDefault();
        callback(true);
        return;
    }
    
    // Show confirmation dialog
    event.preventDefault();
    
    dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        buttons: ['Cancel', 'Continue Once', 'Trust Domain'],
        defaultId: 0,
        cancelId: 0,
        title: 'Certificate Error',
        message: `There is a certificate error for ${hostname}`,
        detail: `Error: ${error}\n\nThis may be a security risk. Only continue if you trust this site.`,
        noLink: true
    }).then((result) => {
        if (result.response === 1) {
            // Continue once
            callback(true);
        } else if (result.response === 2) {
            // Trust domain
            addToCertificateWhitelist(hostname);
            callback(true);
        } else {
            // Cancel
            callback(false);
        }
    }).catch(() => {
        callback(false);
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    // Unregister all shortcuts
    globalShortcut.unregisterAll();
});

// Handle opening external URLs
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// Window control handlers
ipcMain.on('window-control', (event, command) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    switch (command) {
        case 'minimize':
            win.minimize();
            break;
        case 'maximize':
            if (win.isMaximized()) {
                win.unmaximize();
                event.reply('window-maximized', false);
            } else {
                win.maximize();
                event.reply('window-maximized', true);
            }
            break;
        case 'close':
            win.close();
            break;
    }
});

// New window handler
ipcMain.on('new-window', () => {
    createWindow();
});

// Toggle fullscreen
ipcMain.on('toggle-fullscreen', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        window.setFullScreen(!window.isFullScreen());
    }
});

// ==========================================
// SECURE WALLET HANDLERS WITH USER CONFIRMATION
// ==========================================

// Wallet handlers with secure validation and user confirmation
ipcMain.handle('wallet-generate', async (event) => {
    try {
        // Show user confirmation first
        const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'question',
            buttons: ['Cancel', 'Generate Wallet'],
            defaultId: 1,
            cancelId: 0,
            title: 'Generate New Wallet',
            message: 'Do you want to generate a new wallet?',
            detail: 'This will create a new wallet with a new address and private key. Make sure to back up your seed phrase.',
            noLink: true
        });
        
        if (result.response !== 1) {
            return { success: false, error: 'Operation cancelled by user' };
        }
        
        const wallet = walletManager.generateWallet();
        walletManager.saveWallet(wallet);
        return { success: true, wallet: { address: wallet.address } }; // Only return address
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-restore', async (event, mnemonic) => {
    try {
        // Validate mnemonic input
        if (!mnemonic || typeof mnemonic !== 'string') {
            return { success: false, error: 'Invalid mnemonic phrase' };
        }
        
        const words = mnemonic.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
            return { success: false, error: 'Mnemonic must be 12 or 24 words' };
        }
        
        // Show user confirmation first
        const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'question',
            buttons: ['Cancel', 'Restore Wallet'],
            defaultId: 1,
            cancelId: 0,
            title: 'Restore Wallet',
            message: 'Do you want to restore your wallet from the seed phrase?',
            detail: 'This will replace any existing wallet with the restored one.',
            noLink: true
        });
        
        if (result.response !== 1) {
            return { success: false, error: 'Operation cancelled by user' };
        }
        
        const wallet = walletManager.restoreFromMnemonic(mnemonic);
        walletManager.saveWallet(wallet);
        return { success: true, wallet: { address: wallet.address } }; // Only return address
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-load', async () => {
    try {
        // Use fresh instance to avoid cache issues
        const WalletManager = require('./wallet');
        const freshWalletManager = new WalletManager();
        const wallet = freshWalletManager.loadWallet();
        
        // Update global instance if wallet exists
        if (wallet && !walletManager.hasWallet()) {
            console.log('Updating global walletManager instance');
            walletManager = freshWalletManager;
        }
        
        return { success: true, wallet: wallet ? { address: wallet.address } : null };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-clear', async () => {
    try {
        // Show user confirmation first
        const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'warning',
            buttons: ['Cancel', 'Clear Wallet'],
            defaultId: 0,
            cancelId: 0,
            title: 'Clear Wallet',
            message: 'Are you sure you want to clear your wallet?',
            detail: 'This will permanently remove your wallet from this device. Make sure you have backed up your seed phrase.',
            noLink: true
        });
        
        if (result.response !== 1) {
            return { success: false, error: 'Operation cancelled by user' };
        }
        
        walletManager.clearWallet();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-connect-network', async (event, { rpcUrl, chainId, fallbackRpcUrl }) => {
    try {
        // Validate inputs
        if (!rpcUrl || !chainId) {
            return { success: false, error: 'Invalid network parameters' };
        }
        
        await walletManager.connectToNetwork(rpcUrl, chainId, fallbackRpcUrl);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-get-balance', async () => {
    try {
        const balance = await walletManager.getBalance();
        return { success: true, balance };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-send-transaction', async (event, txData) => {
    try {
        // Validate transaction data
        if (!txData || !txData.to) {
            return { success: false, error: 'Invalid transaction data' };
        }
        
        // Format the value for display
        let valueDisplay = 'Unknown';
        if (txData.value) {
            try {
                const { ethers } = require('ethers');
                valueDisplay = ethers.utils.formatEther(txData.value) + ' ETH';
            } catch {
                valueDisplay = txData.value;
            }
        } else if (txData.amount !== undefined) {
            valueDisplay = txData.amount + ' ETH';
        }
        
        // Show user confirmation
        const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'warning',
            buttons: ['Cancel', 'Send Transaction'],
            defaultId: 0,
            cancelId: 0,
            title: 'Confirm Transaction',
            message: 'Do you want to send this transaction?',
            detail: `To: ${txData.to}\nAmount: ${valueDisplay}\nData: ${txData.data || '0x'}`,
            noLink: true
        });
        
        if (result.response !== 1) {
            return { success: false, error: 'Transaction cancelled by user' };
        }
        
        // Handle both formats: {to, amount} and standard ethereum tx format
        if (txData.to && txData.amount !== undefined && !txData.value) {
            const tx = await walletManager.sendTransaction(txData.to, txData.amount);
            return { success: true, transaction: tx.hash };
        } else {
            // Ethereum provider format from dApps
            if (!passwordManager.isWalletUnlocked()) {
                throw new Error('Wallet is locked');
            }
            
            const tx = await walletManager.wallet.sendTransaction(txData);
            return tx.hash; // Return hash directly for dApp compatibility
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Password handlers
ipcMain.handle('password-check-exists', async () => {
    console.log('=== PASSWORD CHECK STARTED ===');
    
    // Always create a fresh instance for password checking to avoid cache issues
    const PasswordManager = require('./passwordManager');
    const freshPasswordManager = new PasswordManager();
    
    const hasPassword = freshPasswordManager.hasPassword();
    console.log('Password check with fresh instance:', { hasPassword });
    
    // Update the global instance if needed
    if (hasPassword && !passwordManager.hasPassword()) {
        console.log('Updating global passwordManager instance');
        passwordManager = freshPasswordManager;
    }
    
    console.log('=== PASSWORD CHECK COMPLETE ===');
    
    return hasPassword;
});

ipcMain.handle('password-set', async (event, password) => {
    try {
        // Validate password
        if (!password || typeof password !== 'string' || password.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters' };
        }
        
        await passwordManager.setPassword(password);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('password-verify', async (event, password) => {
    try {
        if (!password || typeof password !== 'string') {
            return { success: false, error: 'Invalid password' };
        }
        
        await passwordManager.verifyPassword(password);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('password-change', async (event, { oldPassword, newPassword }) => {
    try {
        // Validate inputs
        if (!oldPassword || !newPassword || typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
            return { success: false, error: 'Invalid password data' };
        }
        
        if (newPassword.length < 8) {
            return { success: false, error: 'New password must be at least 8 characters' };
        }
        
        await passwordManager.changePassword(oldPassword, newPassword);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('wallet-lock', async () => {
    passwordManager.lockWallet();
    return { success: true };
});

ipcMain.handle('wallet-check-unlocked', async () => {
    return passwordManager.isWalletUnlocked();
});

ipcMain.handle('wallet-reset-activity', async () => {
    passwordManager.resetActivityTimer();
    return { success: true };
});

// Ethereum Provider IPC Handlers with security
ipcMain.handle('wallet-request-accounts', async (event) => {
    try {
        console.log('[Main] wallet-request-accounts called');
        
        if (!walletManager.wallet) {
            console.log('[Main] No wallet found');
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                windows[0].webContents.send('show-web3-panel');
            }
            return [];
        }
        
        const isUnlocked = passwordManager.isWalletUnlocked();
        if (!isUnlocked) {
            console.log('[Main] Wallet is locked, prompting user');
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                windows[0].webContents.send('show-web3-panel-unlock');
            }
            return [];
        }
        
        const address = walletManager.wallet.address;
        console.log('[Main] Returning wallet address:', address);
        
        return [address];
    } catch (error) {
        console.error('Request accounts error:', error);
        return [];
    }
});

ipcMain.handle('wallet-get-accounts', async (event, data) => {
    try {
        if (!walletManager.wallet || !passwordManager.isWalletUnlocked()) {
            return [];
        }
        
        return [walletManager.wallet.address];
    } catch (error) {
        console.error('Get accounts error:', error);
        return [];
    }
});

ipcMain.handle('wallet-get-address', async () => {
    try {
        if (!walletManager.wallet || !passwordManager.isWalletUnlocked()) {
            return null;
        }
        return walletManager.wallet.address;
    } catch (error) {
        console.error('Get address error:', error);
        return null;
    }
});

// Additional secure handlers for other wallet operations...
// (Add more handlers as needed for tokens, profiles, etc. - all with validation and user confirmation)

// Settings handlers
ipcMain.handle('settings-get', async (event, key) => {
    if (!key || typeof key !== 'string') {
        return null;
    }
    return store.get(`settings.${key}`, null);
});

ipcMain.handle('settings-set', async (event, key, value) => {
    if (!key || typeof key !== 'string') {
        return false;
    }
    store.set(`settings.${key}`, value);
    return true;
});

// App version
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Connection management
const connectedDomains = new Map(); // domain -> { accounts, timestamp }

// Load saved connections
function loadConnectedDomains() {
    try {
        const saved = store.get('connectedDomains', []);
        saved.forEach(([domain, data]) => {
            connectedDomains.set(domain, data);
        });
    } catch (error) {
        console.error('Error loading connected domains:', error);
    }
}

// Save connected domains
function saveConnectedDomains() {
    try {
        store.set('connectedDomains', Array.from(connectedDomains.entries()));
    } catch (error) {
        console.error('Error saving connected domains:', error);
    }
}

// Handle permission revocation
ipcMain.handle('wallet-revoke-permissions', async (event, { domain, permissions }) => {
    console.log('[Main] Revoking permissions for domain:', domain);
    connectedDomains.delete(domain);
    saveConnectedDomains();
    return { success: true };
});

// Clear all connections
ipcMain.handle('wallet-clear-all-connections', async () => {
    console.log('[Main] Clearing all domain connections');
    connectedDomains.clear();
    saveConnectedDomains();
    return { success: true };
});

// Certificate whitelist management
ipcMain.handle('get-certificate-whitelist', async () => {
    return certificateWhitelist;
});

ipcMain.handle('remove-from-certificate-whitelist', async (event, hostname) => {
    if (!hostname || typeof hostname !== 'string') {
        return { success: false, error: 'Invalid hostname' };
    }
    certificateWhitelist = certificateWhitelist.filter(h => h !== hostname);
    saveCertificateWhitelist();
    return { success: true };
});

ipcMain.handle('clear-certificate-whitelist', async () => {
    certificateWhitelist = [];
    saveCertificateWhitelist();
    return { success: true };
});

// Load sidebar configuration
ipcMain.handle('load-sidebar-config', async () => {
    try {
        // Try to load from multiple possible locations
        const possiblePaths = [
            path.join(app.getPath('userData'), 'sidebar-config.json'),  // User config directory
            path.join(app.getAppPath(), 'sidebar-config.json'),         // App directory (packaged)
            path.join(__dirname, 'sidebar-config.json'),                // Development directory
            path.join(process.resourcesPath, 'sidebar-config.json')      // Resources directory (packaged)
        ];
        
        for (const configPath of possiblePaths) {
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                console.log('Loaded sidebar config from:', configPath);
                return { success: true, data: config };
            } catch (e) {
                // Try next path
                continue;
            }
        }
        
        console.log('No sidebar config found in any location');
        return { success: false, error: 'Config file not found' };
    } catch (error) {
        console.error('Error loading sidebar config:', error);
        return { success: false, error: error.message };
    }
});

// Toggle DevTools for active webview
ipcMain.handle('toggle-devtools', async (event) => {
    try {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            // Send message to renderer to toggle devtools for active webview
            event.sender.send('devtools-toggle-requested');
            return { success: true };
        }
        return { success: false, error: 'Window not found' };
    } catch (error) {
        console.error('Error toggling devtools:', error);
        return { success: false, error: error.message };
    }
});