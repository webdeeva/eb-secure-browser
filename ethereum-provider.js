const { ipcRenderer } = require('electron');
const EventEmitter = require('events');

class EthereumProvider extends EventEmitter {
    constructor() {
        super();
        this.chainId = '0x5dc'; // 1500 in hex for GuapcoinX
        this.networkVersion = '1500';
        this.selectedAddress = null;
        this.isMetaMask = true; // Pretend to be MetaMask for compatibility
        this.isConnected = () => true;
        
        // Listen for account changes from main process
        ipcRenderer.on('wallet-account-changed', (event, address) => {
            this.selectedAddress = address;
            this.emit('accountsChanged', address ? [address] : []);
        });
        
        // Listen for network changes
        ipcRenderer.on('wallet-network-changed', (event, chainId) => {
            this.chainId = chainId;
            this.emit('chainChanged', chainId);
        });
    }
    
    // EIP-1193 request method
    async request(args) {
        console.log('[EthereumProvider] request:', args);
        const { method, params } = args;
        
        switch (method) {
            case 'eth_requestAccounts':
                return this._requestAccounts();
                
            case 'eth_accounts':
                return this._getAccounts();
                
            case 'eth_chainId':
                return this.chainId;
                
            case 'net_version':
                return this.networkVersion;
                
            case 'eth_sendTransaction':
                return this._sendTransaction(params[0]);
                
            case 'eth_sign':
                return this._signMessage(params[0], params[1]);
                
            case 'personal_sign':
                return this._personalSign(params[0], params[1]);
                
            case 'eth_signTypedData':
            case 'eth_signTypedData_v3':
            case 'eth_signTypedData_v4':
                return this._signTypedData(params[0], params[1]);
                
            case 'eth_getBalance':
                return this._getBalance(params[0], params[1]);
                
            case 'eth_call':
                return this._ethCall(params[0], params[1]);
                
            case 'eth_estimateGas':
                return this._estimateGas(params[0]);
                
            case 'eth_gasPrice':
                return this._getGasPrice();
                
            case 'eth_getTransactionCount':
                return this._getTransactionCount(params[0], params[1]);
                
            case 'eth_sendRawTransaction':
                return this._sendRawTransaction(params[0]);
                
            case 'wallet_switchEthereumChain':
                return this._switchChain(params[0]);
                
            case 'wallet_addEthereumChain':
                return this._addChain(params[0]);
                
            default:
                throw new Error(`Method ${method} not supported`);
        }
    }
    
    // Request access to accounts
    async _requestAccounts() {
        console.log('[EthereumProvider] Requesting accounts...');
        try {
            const accounts = await ipcRenderer.invoke('wallet-request-accounts');
            console.log('[EthereumProvider] Received accounts:', accounts);
            if (accounts && accounts.length > 0) {
                this.selectedAddress = accounts[0];
            }
            return accounts;
        } catch (error) {
            console.error('[EthereumProvider] Error requesting accounts:', error);
            throw error;
        }
    }
    
    // Get current accounts
    async _getAccounts() {
        const accounts = await ipcRenderer.invoke('wallet-get-accounts');
        return accounts || [];
    }
    
    // Send transaction
    async _sendTransaction(tx) {
        return await ipcRenderer.invoke('wallet-send-transaction', tx);
    }
    
    // Sign message
    async _signMessage(address, message) {
        return await ipcRenderer.invoke('wallet-sign-message', { address, message });
    }
    
    // Personal sign
    async _personalSign(message, address) {
        return await ipcRenderer.invoke('wallet-personal-sign', { message, address });
    }
    
    // Sign typed data
    async _signTypedData(address, typedData) {
        return await ipcRenderer.invoke('wallet-sign-typed-data', { address, typedData });
    }
    
    // Get balance
    async _getBalance(address, blockTag) {
        return await ipcRenderer.invoke('wallet-get-balance', { address, blockTag });
    }
    
    // Eth call
    async _ethCall(callData, blockTag) {
        return await ipcRenderer.invoke('wallet-eth-call', { callData, blockTag });
    }
    
    // Estimate gas
    async _estimateGas(tx) {
        return await ipcRenderer.invoke('wallet-estimate-gas', tx);
    }
    
    // Get gas price
    async _getGasPrice() {
        return await ipcRenderer.invoke('wallet-get-gas-price');
    }
    
    // Get transaction count
    async _getTransactionCount(address, blockTag) {
        return await ipcRenderer.invoke('wallet-get-transaction-count', { address, blockTag });
    }
    
    // Send raw transaction
    async _sendRawTransaction(signedTx) {
        return await ipcRenderer.invoke('wallet-send-raw-transaction', signedTx);
    }
    
    // Switch chain (GuapcoinX only for now)
    async _switchChain(chainData) {
        if (chainData.chainId !== '0x5dc') {
            throw new Error('Only GuapcoinX chain is supported');
        }
        return null;
    }
    
    // Add chain (reject for now as we only support GuapcoinX)
    async _addChain(chainData) {
        throw new Error('Adding new chains is not supported');
    }
    
    // Legacy methods for compatibility
    enable() {
        return this.request({ method: 'eth_requestAccounts' });
    }
    
    send(method, params) {
        return this.request({ method, params });
    }
    
    sendAsync(payload, callback) {
        this.request(payload)
            .then(result => callback(null, { result }))
            .catch(error => callback(error));
    }
}

module.exports = EthereumProvider;