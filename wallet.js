const { ethers } = require('ethers');
const Store = require('electron-store');
const { app } = require('electron');

class WalletManager {
    constructor() {
        this.store = new Store({
            name: 'eb-wallet-data',
            cwd: app.getPath('userData'), // Explicitly set the storage directory
            encryptionKey: 'eb-wallet-encryption-key-v1' // In production, use a more secure key
        });
        this.wallet = null;
        this.provider = null;
    }

    // Generate new wallet with mnemonic
    generateWallet() {
        const wallet = ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic.phrase
        };
    }

    // Restore wallet from mnemonic
    restoreFromMnemonic(mnemonic) {
        try {
            const wallet = ethers.Wallet.fromPhrase(mnemonic);
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                mnemonic: mnemonic
            };
        } catch (error) {
            throw new Error('Invalid mnemonic phrase');
        }
    }

    // Save wallet securely
    saveWallet(walletData) {
        this.store.set('wallet', {
            address: walletData.address,
            privateKey: walletData.privateKey,
            mnemonic: walletData.mnemonic
        });
    }

    // Load saved wallet
    loadWallet() {
        return this.store.get('wallet');
    }

    // Check if wallet exists
    hasWallet() {
        return this.store.has('wallet');
    }

    // Clear wallet data
    clearWallet() {
        this.store.delete('wallet');
        this.wallet = null;
    }

    // Connect to GuapcoinX network with fallback support
    async connectToNetwork(rpcUrl, chainId, fallbackRpcUrl = null) {
        try {
            // Try primary RPC first
            console.log('Attempting to connect to primary RPC:', rpcUrl);
            this.provider = new ethers.JsonRpcProvider(rpcUrl, {
                chainId: parseInt(chainId),
                name: 'GuapcoinX'
            });
            
            // Test the connection
            try {
                await this.provider.getBlockNumber();
                console.log('Successfully connected to primary RPC');
            } catch (primaryError) {
                console.error('Primary RPC failed:', primaryError.message);
                
                // Try fallback RPC if available
                if (fallbackRpcUrl) {
                    console.log('Attempting to connect to fallback RPC:', fallbackRpcUrl);
                    this.provider = new ethers.JsonRpcProvider(fallbackRpcUrl, {
                        chainId: parseInt(chainId),
                        name: 'GuapcoinX'
                    });
                    
                    // Test fallback connection
                    await this.provider.getBlockNumber();
                    console.log('Successfully connected to fallback RPC');
                } else {
                    throw primaryError;
                }
            }

            const walletData = this.loadWallet();
            if (walletData && walletData.privateKey) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
                console.log('Wallet connected to network:', this.wallet.address);
            } else {
                console.log('No wallet data found to connect to network');
            }
            return this.provider;
        } catch (error) {
            console.error('Error connecting to network:', error);
            throw error;
        }
    }

    // Get wallet balance
    async getBalance() {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            // Always load wallet data and create wallet instance with current provider
            const walletData = this.loadWallet();
            if (!walletData || !walletData.privateKey) {
                throw new Error('No wallet found');
            }
            
            // Create wallet instance if not exists or provider changed
            if (!this.wallet || this.wallet.provider !== this.provider) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
                console.log('Wallet instance created for balance check');
            }
            
            const balance = await this.wallet.provider.getBalance(this.wallet.address);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }

    // Send transaction
    async sendTransaction(to, amount) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            // Always load wallet data and create wallet instance with current provider
            const walletData = this.loadWallet();
            if (!walletData || !walletData.privateKey) {
                throw new Error('No wallet found');
            }
            
            // Create wallet instance if not exists or provider changed
            if (!this.wallet || this.wallet.provider !== this.provider) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
            }
            
            const tx = await this.wallet.sendTransaction({
                to: to,
                value: ethers.parseEther(amount)
            });
            
            return tx;
        } catch (error) {
            console.error('Error sending transaction:', error);
            throw error;
        }
    }

    // Get transaction count
    async getTransactionCount() {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            const walletData = this.loadWallet();
            if (!walletData || !walletData.privateKey) {
                throw new Error('No wallet found');
            }
            
            if (!this.wallet || this.wallet.provider !== this.provider) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
            }
            
            return await this.wallet.getTransactionCount();
        } catch (error) {
            console.error('Error getting transaction count:', error);
            throw error;
        }
    }

    // Token Management Functions

    // ERC-20 ABI for token interactions
    getERC20ABI() {
        return [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function transferFrom(address from, address to, uint256 amount) returns (bool)"
        ];
    }

    // Get saved tokens
    getTokens() {
        return this.store.get('tokens', []);
    }

    // Save token to store
    saveToken(tokenData) {
        const tokens = this.getTokens();
        // Check if token already exists
        const existingIndex = tokens.findIndex(t => t.address.toLowerCase() === tokenData.address.toLowerCase());
        
        if (existingIndex >= 0) {
            // Update existing token
            tokens[existingIndex] = tokenData;
        } else {
            // Add new token
            tokens.push(tokenData);
        }
        
        this.store.set('tokens', tokens);
        return tokens;
    }

    // Remove token from store
    removeToken(tokenAddress) {
        const tokens = this.getTokens();
        const filteredTokens = tokens.filter(t => t.address.toLowerCase() !== tokenAddress.toLowerCase());
        this.store.set('tokens', filteredTokens);
        return filteredTokens;
    }

    // Validate token contract (without saving)
    async validateTokenContract(contractAddress) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            console.log('Validating token:', contractAddress);
            console.log('Provider:', this.provider);
            
            // First check if there's code at the address
            const code = await this.provider.getCode(contractAddress);
            console.log('Contract code length:', code.length);
            
            if (code === '0x' || code.length <= 2) {
                throw new Error('No contract found at this address');
            }
            
            // Create contract instance
            const tokenContract = new ethers.Contract(contractAddress, this.getERC20ABI(), this.provider);
            
            // Fetch token metadata one by one to better handle errors
            let name, symbol, decimals;
            
            try {
                name = await tokenContract.name();
                console.log('Token name:', name);
            } catch (e) {
                console.error('Error getting name:', e);
                // Some tokens might not have a name, use a default
                name = 'Unknown Token';
            }
            
            try {
                symbol = await tokenContract.symbol();
                console.log('Token symbol:', symbol);
            } catch (e) {
                console.error('Error getting symbol:', e);
                throw new Error('Failed to get token symbol - may not be an ERC-20 token');
            }
            
            try {
                decimals = await tokenContract.decimals();
                console.log('Token decimals:', decimals);
            } catch (e) {
                console.error('Error getting decimals:', e);
                // Default to 18 decimals if not specified
                decimals = 18;
            }
            
            const tokenData = {
                address: contractAddress,
                name: name,
                symbol: symbol,
                decimals: Number(decimals),
                chainId: 71111
            };
            
            console.log('Token validation successful:', tokenData);
            return tokenData;
            
        } catch (error) {
            console.error('Error validating token:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                reason: error.reason
            });
            throw error;
        }
    }

    // Import token by contract address
    async importToken(contractAddress) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            // First validate the token
            const tokenData = await this.validateTokenContract(contractAddress);
            
            // If validation successful, save the token
            this.saveToken(tokenData);
            
            return tokenData;
        } catch (error) {
            console.error('Error importing token:', error);
            throw error;
        }
    }

    // Get token balance
    async getTokenBalance(tokenAddress) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            const walletData = this.loadWallet();
            if (!walletData || !walletData.address) {
                throw new Error('No wallet found');
            }
            
            // Create contract instance
            const tokenContract = new ethers.Contract(tokenAddress, this.getERC20ABI(), this.provider);
            
            // Get balance
            const balance = await tokenContract.balanceOf(walletData.address);
            
            // Get token info for decimals
            const tokens = this.getTokens();
            const token = tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
            
            if (token) {
                return ethers.formatUnits(balance, token.decimals);
            } else {
                // If token not found, fetch decimals
                const decimals = await tokenContract.decimals();
                return ethers.formatUnits(balance, decimals);
            }
        } catch (error) {
            console.error('Error getting token balance:', error);
            throw error;
        }
    }

    // Get all token balances
    async getAllTokenBalances() {
        const tokens = this.getTokens();
        const balances = {};
        
        for (const token of tokens) {
            try {
                const balance = await this.getTokenBalance(token.address);
                balances[token.address] = {
                    ...token,
                    balance: balance
                };
            } catch (error) {
                console.error(`Error getting balance for token ${token.symbol}:`, error);
                balances[token.address] = {
                    ...token,
                    balance: '0'
                };
            }
        }
        
        return balances;
    }

    // Send token transaction
    async sendTokenTransaction(tokenAddress, to, amount) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            // Always load wallet data and create wallet instance with current provider
            const walletData = this.loadWallet();
            if (!walletData || !walletData.privateKey) {
                throw new Error('No wallet found');
            }
            
            // Create wallet instance if not exists or provider changed
            if (!this.wallet || this.wallet.provider !== this.provider) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
            }
            
            // Get token info
            const tokens = this.getTokens();
            const token = tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
            
            if (!token) {
                throw new Error('Token not found in wallet');
            }
            
            // Create contract instance with signer
            const tokenContract = new ethers.Contract(tokenAddress, this.getERC20ABI(), this.wallet);
            
            // Convert amount to proper units
            const amountInUnits = ethers.parseUnits(amount, token.decimals);
            
            // Send transaction
            const tx = await tokenContract.transfer(to, amountInUnits);
            
            return tx;
        } catch (error) {
            console.error('Error sending token transaction:', error);
            throw error;
        }
    }

    // Approve token spending
    async approveToken(tokenAddress, spenderAddress, amount) {
        if (!this.provider) throw new Error('No network connected');
        
        try {
            const walletData = this.loadWallet();
            if (!walletData || !walletData.privateKey) {
                throw new Error('No wallet found');
            }
            
            if (!this.wallet || this.wallet.provider !== this.provider) {
                this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
            }
            
            // Get token info
            const tokens = this.getTokens();
            const token = tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
            
            if (!token) {
                throw new Error('Token not found in wallet');
            }
            
            // Create contract instance with signer
            const tokenContract = new ethers.Contract(tokenAddress, this.getERC20ABI(), this.wallet);
            
            // Convert amount to proper units (or use MaxUint256 for unlimited approval)
            const amountInUnits = amount === 'unlimited' 
                ? ethers.MaxUint256 
                : ethers.parseUnits(amount, token.decimals);
            
            // Send approval transaction
            const tx = await tokenContract.approve(spenderAddress, amountInUnits);
            
            return tx;
        } catch (error) {
            console.error('Error approving token:', error);
            throw error;
        }
    }
}

module.exports = WalletManager;