const { ethers } = require('ethers');
const path = require('path');

class EBDomainResolver {
  constructor() {
    // Guapcoin X RPC endpoints
    this.primaryRpc = 'https://rpc-mainnet-2.guapcoinx.com';
    this.fallbackRpc = 'https://rpc-mainnet.guapcoinx.com';
    
    // Initialize provider with primary RPC
    this.initializeProvider();
    
    // V7 Contract configuration
    this.contractAddress = '0xcDfA7c728Bd1167279b2D60B7380AF02BDC1E878';
    this.contractABI = require('./v7_abi.json');
    
    // Cache resolved domains
    this.cache = new Map();
  }
  
  async initializeProvider() {
    try {
      // Try primary RPC first
      this.provider = new ethers.JsonRpcProvider(this.primaryRpc);
      await this.provider.getBlockNumber();
      console.log('EBDomainResolver: Connected to primary RPC');
    } catch (error) {
      console.error('EBDomainResolver: Primary RPC failed, trying fallback...', error.message);
      try {
        // Try fallback RPC
        this.provider = new ethers.JsonRpcProvider(this.fallbackRpc);
        await this.provider.getBlockNumber();
        console.log('EBDomainResolver: Connected to fallback RPC');
      } catch (fallbackError) {
        console.error('EBDomainResolver: Both RPCs failed', fallbackError.message);
        throw fallbackError;
      }
    }
    
    // Initialize contract with the working provider
    this.contract = new ethers.Contract(
      this.contractAddress,
      this.contractABI,
      this.provider
    );
  }

  // Check if URL is an EB domain
  isEBDomain(url) {
    const ebTLDs = ['.guap', '.hbcu'];
    // Remove protocol if present
    let cleanUrl = url;
    if (url.startsWith('https://') || url.startsWith('http://')) {
      cleanUrl = url.replace(/^https?:\/\//, '');
    }
    // Remove path if present
    cleanUrl = cleanUrl.split('/')[0];
    return ebTLDs.some(tld => cleanUrl.endsWith(tld));
  }

  // Extract domain parts
  parseDomain(url) {
    // Remove protocol if present
    let cleanUrl = url;
    if (url.startsWith('https://') || url.startsWith('http://')) {
      cleanUrl = url.replace(/^https?:\/\//, '');
    }
    
    const match = cleanUrl.match(/^([^\/]+)(\/.*)?$/);
    if (!match) return null;
    
    const [, domain, path = '/'] = match;
    const parts = domain.split('.');
    
    if (parts.length >= 2) {
      const tld = '.' + parts[parts.length - 1];
      const name = parts.slice(0, -1).join('.');
      return { name, tld, path, fullDomain: `${name}${tld}` };
    }
    
    return null;
  }

  // Resolve domain to content
  async resolveDomain(url) {
    if (!this.isEBDomain(url)) {
      return null;
    }

    const domainInfo = this.parseDomain(url);
    if (!domainInfo) return null;

    // Check cache first
    const cacheKey = domainInfo.fullDomain;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Ensure provider is initialized
      if (!this.provider || !this.contract) {
        await this.initializeProvider();
      }
      // Get token ID first
      const tokenId = await this.contract.tokenIdByDomain(domainInfo.fullDomain);
      
      // Check if domain exists - but also check if tokenId is valid
      // Since tokenId 0 might be valid, we'll also verify by getting domain info
      const exists = await this.contract.domainExists(domainInfo.fullDomain);
      
      // If domainExists returns false but we have a tokenId, try to get domain info
      if (!exists && tokenId !== undefined) {
        try {
          const [name, tld, owner, registeredAt] = await this.contract.getDomainInfo(tokenId);
          // If we can get domain info, verify it matches the requested domain
          const retrievedDomain = `${name}${tld}`;
          if (retrievedDomain.toLowerCase() === domainInfo.fullDomain.toLowerCase() && 
              owner !== '0x0000000000000000000000000000000000000000') {
            // Continue with resolution - domain exists
          } else {
            return { error: 'Domain not registered' };
          }
        } catch (e) {
          return { error: 'Domain not registered' };
        }
      } else if (!exists) {
        return { error: 'Domain not registered' };
      }
      
      // Get domain info
      const [name, tld, owner, registeredAt] = await this.contract.getDomainInfo(tokenId);
      
      // Get records (website, ipfs, etc.)
      const records = {};
      // Check for all possible record types the contract might support
      const recordTypes = ['url', 'website', 'ipfs', 'ip', 'ipv4', 'ipv6', 'description', 'social', 'content'];
      
      for (const recordType of recordTypes) {
        try {
          const value = await this.contract.getRecord(tokenId, recordType);
          if (value) {
            records[recordType] = value;
            // If we found 'url', also set it as 'website' for compatibility
            if (recordType === 'url' && !records.website) {
              records.website = value;
            }
            // If we found 'ip' or 'ipv4', normalize to 'ip'
            if ((recordType === 'ipv4' || recordType === 'ip') && value) {
              records.ip = value;
            }
          }
        } catch (e) {
          // Record doesn't exist - silent fail
        }
      }

      const result = {
        domain: domainInfo.fullDomain,
        owner,
        tokenId: tokenId.toString(),
        registeredAt: new Date(Number(registeredAt) * 1000),
        records,
        path: domainInfo.path
      };

      // Cache for 5 minutes
      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

      return result;
    } catch (error) {
      console.error('Domain resolution error:', error);
      return { error: error.message };
    }
  }

  // Get content URL from domain records
  getContentUrl(domainData) {
    if (!domainData || domainData.error) return null;

    const { records, path, domain } = domainData;
    
    console.log(`Getting content URL for ${domain}, records:`, records);

    // Priority order for resolution:
    // 1. URL/Website (direct redirect to a website)
    // 2. IP Address (direct connection to server)
    // 3. IPFS Hash (decentralized content)
    // 4. Default landing page
    
    // Check 'url' first as that's what the contract update uses
    if (records.url || records.website) {
      // Use 'url' if available, fallback to 'website'
      let url = records.url || records.website;
      console.log(`Found redirect URL for ${domain}: ${url}`);
      
      // Ensure proper URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // For redirects, we typically don't append the path
      // as we're redirecting to a specific destination
      return url;
    }
    
    // Check for IP address mapping
    if (records.ip || records.ipv4 || records.ipv6) {
      const ip = records.ip || records.ipv4 || records.ipv6;
      console.log(`Found IP address for ${domain}: ${ip}`);
      
      // Validate IP address format
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
      
      if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
        // For IP addresses, we'll use HTTP by default (user can upgrade to HTTPS if needed)
        // Some servers might not have SSL certificates for direct IP access
        return `http://${ip}${path}`;
      } else {
        console.warn(`Invalid IP address format for ${domain}: ${ip}`);
      }
    }

    // Check for IPFS content
    if (records.ipfs) {
      console.log(`Found IPFS content for ${domain}: ${records.ipfs}`);
      
      // Support different IPFS hash formats
      let ipfsHash = records.ipfs;
      
      // Remove ipfs:// prefix if present
      if (ipfsHash.startsWith('ipfs://')) {
        ipfsHash = ipfsHash.replace('ipfs://', '');
      }
      
      // Use multiple IPFS gateways for redundancy
      const gateways = [
        'https://ipfs.io/ipfs/',
        'https://gateway.ipfs.io/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/'
      ];
      
      // Use the primary gateway (you could implement fallback logic here)
      return `${gateways[0]}${ipfsHash}${path}`;
    }
    
    // Check for custom content field
    if (records.content) {
      console.log(`Found custom content for ${domain}`);
      // Content could be HTML or a URL
      if (records.content.startsWith('http')) {
        return records.content;
      }
      // If it's raw HTML, we could display it directly (would need special handling)
      // For now, fall through to default
    }

    console.log(`No redirect found for ${domain}, showing domain info page`);
    // Default to EB Domains landing page with query parameter
    return `https://domains.everythingblack.xyz/domain?name=${domainData.domain}`;
  }
}

module.exports = EBDomainResolver;