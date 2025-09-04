const { contextBridge, ipcRenderer } = require('electron');

// Input validation helpers
const validateString = (value) => typeof value === 'string' && value.length > 0;
const validateUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};
const validateObject = (obj) => obj && typeof obj === 'object' && obj !== null;

// Secure API exposed to renderer
const ebAPI = {
    // ==========================================
    // EVENT SYSTEM
    // ==========================================
    on: (channel, func) => {
        const validChannels = [
            'bookmarks', 'history', 'history-cleared',
            'certificate-error-modal', 'request-tx-approval',
            'show-web3-panel', 'show-web3-panel-unlock',
            'menu-new-tab', 'menu-close-tab', 'menu-open-url',
            'menu-open-documentation', 'menu-about',
            'window-maximized'
        ];
        
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, func);
        } else {
            console.warn('Invalid channel for on:', channel);
        }
    },

    once: (channel, func) => {
        const validChannels = [
            'bookmarks', 'history', 'history-cleared',
            'certificate-error-modal', 'request-tx-approval',
            'show-web3-panel', 'show-web3-panel-unlock',
            'menu-new-tab', 'menu-close-tab', 'menu-open-url',
            'menu-open-documentation', 'menu-about',
            'window-maximized'
        ];
        
        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, func);
        } else {
            console.warn('Invalid channel for once:', channel);
        }
    },

    send: (channel, ...args) => {
        const validChannels = [
            'add-bookmark', 'remove-bookmark', 'get-bookmarks',
            'add-history', 'get-history', 'clear-history',
            'reload-page', 'go-back', 'navigate-home',
            'open-external', 'window-control', 'new-window',
            'toggle-fullscreen', 'tx-approval-response'
        ];
        
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            console.warn('Invalid channel for send:', channel);
        }
    },

    invoke: async (channel, ...args) => {
        const validChannels = [
            'open-chatbot', 'open-branded-window',
            'clear-cache', 'copy-to-clipboard', 'download-file',
            'get-app-version', 'settings-get', 'settings-set',
            'get-certificate-whitelist', 'remove-from-certificate-whitelist', 'clear-certificate-whitelist'
        ];
        
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, ...args);
        } else {
            console.warn('Invalid channel for invoke:', channel);
            return null;
        }
    },

    // ==========================================
    // WALLET API (SECURE)
    // ==========================================
    wallet: {
        // Generation and restoration with validation
        generate: async () => {
            try {
                return await ipcRenderer.invoke('wallet-generate');
            } catch (error) {
                console.error('Wallet generation error:', error);
                return { success: false, error: error.message };
            }
        },

        restore: async (mnemonic) => {
            if (!validateString(mnemonic)) {
                return { success: false, error: 'Invalid mnemonic phrase' };
            }
            
            try {
                return await ipcRenderer.invoke('wallet-restore', mnemonic.trim());
            } catch (error) {
                console.error('Wallet restore error:', error);
                return { success: false, error: error.message };
            }
        },

        load: async () => {
            try {
                return await ipcRenderer.invoke('wallet-load');
            } catch (error) {
                console.error('Wallet load error:', error);
                return { success: false, error: error.message };
            }
        },

        clear: async () => {
            try {
                return await ipcRenderer.invoke('wallet-clear');
            } catch (error) {
                console.error('Wallet clear error:', error);
                return { success: false, error: error.message };
            }
        },

        // Network operations
        connectNetwork: async (rpcUrl, chainId, fallbackRpcUrl) => {
            if (!validateString(rpcUrl) || !chainId) {
                return { success: false, error: 'Invalid network parameters' };
            }
            
            try {
                return await ipcRenderer.invoke('wallet-connect-network', {
                    rpcUrl,
                    chainId,
                    fallbackRpcUrl
                });
            } catch (error) {
                console.error('Network connection error:', error);
                return { success: false, error: error.message };
            }
        },

        getBalance: async () => {
            try {
                return await ipcRenderer.invoke('wallet-get-balance');
            } catch (error) {
                console.error('Get balance error:', error);
                return { success: false, error: error.message };
            }
        },

        // Transaction operations with validation
        sendTransaction: async (txData) => {
            if (!validateObject(txData) || !txData.to) {
                return { success: false, error: 'Invalid transaction data' };
            }
            
            try {
                return await ipcRenderer.invoke('wallet-send-transaction', txData);
            } catch (error) {
                console.error('Send transaction error:', error);
                return { success: false, error: error.message };
            }
        },

        // Account management
        requestAccounts: async () => {
            try {
                return await ipcRenderer.invoke('wallet-request-accounts');
            } catch (error) {
                console.error('Request accounts error:', error);
                return [];
            }
        },

        getAccounts: async (data) => {
            try {
                return await ipcRenderer.invoke('wallet-get-accounts', data);
            } catch (error) {
                console.error('Get accounts error:', error);
                return [];
            }
        },

        getAddress: async () => {
            try {
                return await ipcRenderer.invoke('wallet-get-address');
            } catch (error) {
                console.error('Get address error:', error);
                return null;
            }
        },

        // Signature operations (placeholder - implement as needed)
        signMessage: async (address, message) => {
            if (!validateString(address) || !validateString(message)) {
                throw new Error('Invalid parameters for message signing');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-sign-message', { address, message });
            } catch (error) {
                console.error('Sign message error:', error);
                throw error;
            }
        },

        personalSign: async (message, address) => {
            if (!validateString(address) || !validateString(message)) {
                throw new Error('Invalid parameters for personal sign');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-personal-sign', { message, address });
            } catch (error) {
                console.error('Personal sign error:', error);
                throw error;
            }
        }
    },

    // ==========================================
    // PASSWORD API (SECURE)
    // ==========================================
    password: {
        checkExists: async () => {
            try {
                return await ipcRenderer.invoke('password-check-exists');
            } catch (error) {
                console.error('Password check error:', error);
                return false;
            }
        },

        set: async (password) => {
            if (!validateString(password)) {
                return { success: false, error: 'Invalid password' };
            }
            
            try {
                return await ipcRenderer.invoke('password-set', password);
            } catch (error) {
                console.error('Password set error:', error);
                return { success: false, error: error.message };
            }
        },

        verify: async (password) => {
            if (!validateString(password)) {
                return { success: false, error: 'Invalid password' };
            }
            
            try {
                return await ipcRenderer.invoke('password-verify', password);
            } catch (error) {
                console.error('Password verify error:', error);
                return { success: false, error: error.message };
            }
        },

        change: async (oldPassword, newPassword) => {
            if (!validateString(oldPassword) || !validateString(newPassword)) {
                return { success: false, error: 'Invalid password parameters' };
            }
            
            try {
                return await ipcRenderer.invoke('password-change', { oldPassword, newPassword });
            } catch (error) {
                console.error('Password change error:', error);
                return { success: false, error: error.message };
            }
        },

        lock: async () => {
            try {
                return await ipcRenderer.invoke('wallet-lock');
            } catch (error) {
                console.error('Wallet lock error:', error);
                return { success: false, error: error.message };
            }
        },

        checkUnlocked: async () => {
            try {
                return await ipcRenderer.invoke('wallet-check-unlocked');
            } catch (error) {
                console.error('Check unlocked error:', error);
                return false;
            }
        },

        resetActivity: async () => {
            try {
                return await ipcRenderer.invoke('wallet-reset-activity');
            } catch (error) {
                console.error('Reset activity error:', error);
                return { success: false, error: error.message };
            }
        }
    },

    // ==========================================
    // BOOKMARKS API
    // ==========================================
    bookmarks: {
        add: (folder, bookmark) => {
            if (!validateString(folder) || !validateObject(bookmark) || !validateString(bookmark.url)) {
                console.warn('Invalid bookmark data');
                return;
            }
            
            ipcRenderer.send('add-bookmark', { folder, bookmark });
        },

        remove: (url) => {
            if (!validateString(url)) {
                console.warn('Invalid URL for bookmark removal');
                return;
            }
            
            ipcRenderer.send('remove-bookmark', url);
        },

        get: () => {
            ipcRenderer.send('get-bookmarks');
        }
    },

    // ==========================================
    // HISTORY API
    // ==========================================
    history: {
        add: (url) => {
            if (!validateUrl(url)) {
                console.warn('Invalid URL for history');
                return;
            }
            
            ipcRenderer.send('add-history', url);
        },

        get: () => {
            ipcRenderer.send('get-history');
        },

        clear: () => {
            ipcRenderer.send('clear-history');
        }
    },

    // ==========================================
    // DOMAIN RESOLVER API
    // ==========================================
    domains: {
        resolve: async (domain) => {
            if (!validateString(domain)) {
                return { error: 'Invalid domain' };
            }
            
            try {
                return await ipcRenderer.invoke('resolve-domain', domain);
            } catch (error) {
                console.error('Domain resolve error:', error);
                return { error: error.message };
            }
        },

        getInfo: async (domain) => {
            if (!validateString(domain)) {
                return { error: 'Invalid domain' };
            }
            
            try {
                return await ipcRenderer.invoke('get-domain-info', domain);
            } catch (error) {
                console.error('Domain info error:', error);
                return { error: error.message };
            }
        },

        isEBDomain: async (url) => {
            if (!validateString(url)) {
                return false;
            }
            
            try {
                return await ipcRenderer.invoke('is-eb-domain', url);
            } catch (error) {
                console.error('EB domain check error:', error);
                return false;
            }
        }
    },

    // ==========================================
    // TOKEN API (SECURE)
    // ==========================================
    tokens: {
        validate: async (contractAddress) => {
            if (!validateString(contractAddress)) {
                throw new Error('Invalid contract address');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-validate-token', contractAddress);
            } catch (error) {
                console.error('Token validation error:', error);
                throw error;
            }
        },

        import: async (contractAddress) => {
            if (!validateString(contractAddress)) {
                throw new Error('Invalid contract address');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-import-token', contractAddress);
            } catch (error) {
                console.error('Token import error:', error);
                throw error;
            }
        },

        get: async () => {
            try {
                return await ipcRenderer.invoke('wallet-get-tokens');
            } catch (error) {
                console.error('Get tokens error:', error);
                throw error;
            }
        },

        remove: async (tokenAddress) => {
            if (!validateString(tokenAddress)) {
                throw new Error('Invalid token address');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-remove-token', tokenAddress);
            } catch (error) {
                console.error('Remove token error:', error);
                throw error;
            }
        },

        getBalance: async (tokenAddress) => {
            if (!validateString(tokenAddress)) {
                throw new Error('Invalid token address');
            }
            
            try {
                return await ipcRenderer.invoke('wallet-get-token-balance', tokenAddress);
            } catch (error) {
                console.error('Get token balance error:', error);
                throw error;
            }
        },

        getAllBalances: async () => {
            try {
                return await ipcRenderer.invoke('wallet-get-all-token-balances');
            } catch (error) {
                console.error('Get all token balances error:', error);
                throw error;
            }
        }
    },

    // ==========================================
    // PROFILE API (SECURE)
    // ==========================================
    profiles: {
        export: async () => {
            try {
                return await ipcRenderer.invoke('profile-export');
            } catch (error) {
                console.error('Profile export error:', error);
                return { success: false, error: error.message };
            }
        },

        import: async () => {
            try {
                return await ipcRenderer.invoke('profile-import');
            } catch (error) {
                console.error('Profile import error:', error);
                return { success: false, error: error.message };
            }
        },

        checkAuto: async () => {
            try {
                return await ipcRenderer.invoke('profile-check-auto');
            } catch (error) {
                console.error('Profile auto-check error:', error);
                return { success: false, error: error.message };
            }
        },

        delete: async () => {
            try {
                return await ipcRenderer.invoke('profile-delete');
            } catch (error) {
                console.error('Profile delete error:', error);
                return { success: false, error: error.message };
            }
        }
    },

    // ==========================================
    // SIDEBAR CONFIG API
    // ==========================================
    sidebarConfig: {
        load: async () => {
            try {
                return await ipcRenderer.invoke('load-sidebar-config');
            } catch (error) {
                console.error('Sidebar config load error:', error);
                return { success: false, error: error.message };
            }
        }
    },

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================
    utils: {
        copyToClipboard: async (text) => {
            if (!validateString(text)) {
                return { success: false, error: 'Invalid text' };
            }
            
            try {
                return await ipcRenderer.invoke('copy-to-clipboard', text);
            } catch (error) {
                console.error('Copy to clipboard error:', error);
                return { success: false, error: error.message };
            }
        },

        downloadFile: async (content, filename) => {
            if (!validateString(content) || !validateString(filename)) {
                return { success: false, error: 'Invalid file parameters' };
            }
            
            try {
                return await ipcRenderer.invoke('download-file', { content, filename });
            } catch (error) {
                console.error('Download file error:', error);
                return { success: false, error: error.message };
            }
        },

        openExternal: (url) => {
            if (!validateUrl(url)) {
                console.warn('Invalid URL for external open');
                return;
            }
            
            ipcRenderer.send('open-external', url);
        },

        openChatbot: async () => {
            try {
                return await ipcRenderer.invoke('open-chatbot');
            } catch (error) {
                console.error('Open chatbot error:', error);
                return null;
            }
        },

        openBrandedWindow: async (url, options = {}) => {
            if (!validateUrl(url)) {
                throw new Error('Invalid URL for branded window');
            }
            
            try {
                return await ipcRenderer.invoke('open-branded-window', url, options);
            } catch (error) {
                console.error('Open branded window error:', error);
                throw error;
            }
        },

        clearCache: async () => {
            try {
                return await ipcRenderer.invoke('clear-cache');
            } catch (error) {
                console.error('Clear cache error:', error);
                return { success: false, error: error.message };
            }
        }
    },

    // ==========================================
    // WINDOW CONTROL
    // ==========================================
    window: {
        control: (command) => {
            const validCommands = ['minimize', 'maximize', 'close'];
            if (!validateString(command) || !validCommands.includes(command)) {
                console.warn('Invalid window control command');
                return;
            }
            
            ipcRenderer.send('window-control', command);
        },

        new: () => {
            ipcRenderer.send('new-window');
        },

        toggleFullscreen: () => {
            ipcRenderer.send('toggle-fullscreen');
        }
    },

    // ==========================================
    // NAVIGATION
    // ==========================================
    navigation: {
        reloadPage: () => {
            ipcRenderer.send('reload-page');
        },

        goBack: () => {
            ipcRenderer.send('go-back');
        },

        navigateHome: () => {
            ipcRenderer.send('navigate-home');
        }
    },

    // ==========================================
    // ETHEREUM PROVIDER (SECURE)
    // ==========================================
    ethereum: {
        request: async (args) => {
            if (!validateObject(args) || !validateString(args.method)) {
                throw new Error('Invalid ethereum request');
            }
            
            try {
                return await ipcRenderer.invoke('ethereum-request', args);
            } catch (error) {
                console.error('Ethereum request error:', error);
                throw error;
            }
        },

        requestWithConfirm: async (args) => {
            if (!validateObject(args) || !validateString(args.method)) {
                throw new Error('Invalid ethereum request');
            }
            
            try {
                return await ipcRenderer.invoke('ethereum-request-confirm', args);
            } catch (error) {
                console.error('Ethereum request with confirm error:', error);
                throw error;
            }
        }
    }
};

// Expose the secure API to the renderer process
contextBridge.exposeInMainWorld('ebAPI', ebAPI);

console.log('✅ Secure preload script loaded - APIs exposed via ebAPI');