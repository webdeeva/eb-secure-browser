// Search Fallback System
// Handles backend failures with SearchAPI.io fallback and Google redirect option

class SearchFallback {
    constructor() {
        // SearchAPI.io configuration
        this.searchApiKey = 'YOUR_SEARCHAPI_KEY'; // Replace with actual key
        this.searchApiUrl = 'https://www.searchapi.io/api/v1/search';
        
        // Backend endpoints - Use deployed API from config
        if (typeof window !== 'undefined' && window.APP_CONFIG) {
            this.backendUrl = window.APP_CONFIG.BACKEND_URL;
        } else if (typeof config !== 'undefined') {
            this.backendUrl = config.BACKEND_URL;
        } else {
            this.backendUrl = 'https://eb2new-backend-48935.ondigitalocean.app';
        }
        this.endpoints = {
            search: '/api/v1/search',
            enhancedSearch: '/api/v1/enhanced-search',
            suggest: '/api/v1/search/suggest'
        };
        
        // Retry configuration
        this.maxRetries = 2;
        this.retryDelay = 1000; // ms
        
        // Cache configuration
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }
    
    // Main search method with fallback logic
    async search(query, options = {}) {
        const cacheKey = this.getCacheKey(query, options);
        
        // Check cache first
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log('Returning cached results');
            return cached;
        }
        
        try {
            // Try internal backend first
            console.log('Attempting backend search...');
            const backendResults = await this.searchBackend(query, options);
            this.setCache(cacheKey, backendResults);
            return backendResults;
            
        } catch (backendError) {
            console.error('Backend search failed:', backendError);
            
            // Try SearchAPI.io fallback
            try {
                console.log('Falling back to SearchAPI.io...');
                const searchApiResults = await this.searchViaSearchApi(query, options);
                this.setCache(cacheKey, searchApiResults);
                return searchApiResults;
                
            } catch (searchApiError) {
                console.error('SearchAPI.io failed:', searchApiError);
                
                // Last resort: redirect to Google
                if (options.allowGoogleRedirect !== false) {
                    console.log('Redirecting to Google Search...');
                    this.redirectToGoogle(query);
                    return null;
                }
                
                // Return error state
                throw new Error('All search methods failed');
            }
        }
    }
    
    // Search via backend
    async searchBackend(query, options) {
        const params = new URLSearchParams({
            q: query,
            enhance: options.enhance || 'auto',
            ...(options.category && { category: options.category }),
            ...(options.location && { location: options.location }),
            ...(options.distance && { distance: options.distance }),
            ...(options.verified && { verified: 'true' }),
            ...(options.featured && { featured: 'true' }),
            ...(options.premium && { premium: 'true' })
        });
        
        const endpoint = options.enhance ? this.endpoints.enhancedSearch : this.endpoints.search;
        const url = `${this.backendUrl}${endpoint}?${params}`;
        
        console.log('Searching with URL:', url);
        
        const response = await this.fetchWithRetry(url, {
            timeout: 5000 // 5 second timeout
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend error: ${response.status}`, errorText);
            throw new Error(`Backend returned ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Search response:', data);
        
        // If no results from main search, try debug endpoint as fallback
        if (data.data && data.data.results && data.data.results.length === 0) {
            console.log('No results from main search, trying debug endpoint...');
            const debugUrl = `${this.backendUrl}/api/v1/debug/search?q=${encodeURIComponent(query)}`;
            
            try {
                const debugResponse = await this.fetchWithRetry(debugUrl, { timeout: 3000 });
                if (debugResponse.ok) {
                    const debugData = await debugResponse.json();
                    console.log('Debug search results:', debugData);
                    
                    if (debugData.results && debugData.results.length > 0) {
                        // Transform debug results to match expected format
                        data.data.results = debugData.results.map(r => ({
                            id: r.id,
                            name: r.name,
                            description: r.description,
                            url: '#', // Placeholder URL
                            is_black_owned: true,
                            verification_level: 3,
                            source: 'database'
                        }));
                        data.data.total_results = debugData.results.length;
                    }
                }
            } catch (debugError) {
                console.error('Debug search failed:', debugError);
            }
        }
        
        return data;
    }
    
    // Search via SearchAPI.io
    async searchViaSearchApi(query, options) {
        // Add "Black-owned business" context to queries
        const enhancedQuery = this.enhanceQueryForBlackBusiness(query);
        
        const params = new URLSearchParams({
            engine: 'google',
            q: enhancedQuery,
            api_key: this.searchApiKey,
            num: options.limit || 20,
            ...(options.location && { location: options.location })
        });
        
        const url = `${this.searchApiUrl}?${params}`;
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`SearchAPI returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Transform SearchAPI results to match our format
        return this.transformSearchApiResults(data, query);
    }
    
    // Enhance query for Black-owned business context
    enhanceQueryForBlackBusiness(query) {
        const blackBusinessKeywords = [
            'Black-owned',
            'African American owned',
            'Black business',
            'minority-owned'
        ];
        
        // Check if query already contains Black business keywords
        const hasBlackBusinessContext = blackBusinessKeywords.some(keyword => 
            query.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (!hasBlackBusinessContext) {
            // Add context based on query type
            if (query.match(/\b(near me|in \w+|local)\b/i)) {
                return `Black-owned ${query}`;
            } else if (query.match(/\b(best|top|good)\b/i)) {
                return query.replace(/\b(best|top|good)\b/i, '$1 Black-owned');
            } else {
                return `${query} Black-owned business`;
            }
        }
        
        return query;
    }
    
    // Transform SearchAPI results to our format
    transformSearchApiResults(searchApiData, originalQuery) {
        const results = searchApiData.organic_results || [];
        
        return {
            success: true,
            data: {
                query: originalQuery,
                total_results: searchApiData.search_information?.total_results || results.length,
                results: results.map(result => this.transformSingleResult(result)),
                source: 'searchapi',
                fallback: true
            }
        };
    }
    
    // Transform single SearchAPI result
    transformSingleResult(result) {
        // Detect if result might be Black-owned based on content
        const isLikelyBlackOwned = this.detectBlackOwned(result);
        
        return {
            name: result.title,
            url: result.link,
            description: result.snippet,
            is_black_owned: isLikelyBlackOwned,
            verification_level: isLikelyBlackOwned ? 1 : 0, // Low confidence from web search
            source: 'web',
            // Extract location if available
            location: this.extractLocation(result),
            // Add metadata
            metadata: {
                source: 'searchapi',
                position: result.position,
                displayed_link: result.displayed_link
            }
        };
    }
    
    // Detect if result might be Black-owned
    detectBlackOwned(result) {
        const blackOwnedIndicators = [
            'black-owned',
            'black owned',
            'african american owned',
            'black business',
            'minority-owned',
            'black entrepreneur',
            'black founder'
        ];
        
        const searchText = `${result.title} ${result.snippet}`.toLowerCase();
        
        return blackOwnedIndicators.some(indicator => 
            searchText.includes(indicator)
        );
    }
    
    // Extract location from result
    extractLocation(result) {
        // Try to extract location from snippet or title
        const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z]{2})\b/;
        const match = result.snippet.match(locationPattern) || result.title.match(locationPattern);
        
        if (match) {
            return {
                city: match[1],
                state: match[2]
            };
        }
        
        return null;
    }
    
    // Redirect to Google Search
    redirectToGoogle(query) {
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' Black-owned business')}`;
        
        // Show notification before redirect
        if (typeof window !== 'undefined') {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #c44901;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            notification.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 5px;">Search Unavailable</div>
                <div style="font-size: 14px;">Redirecting to Google Search...</div>
            `;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                window.location.href = googleUrl;
            }, 2000);
        }
    }
    
    // Fetch with retry logic
    async fetchWithRetry(url, options = {}, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            return response;
            
        } catch (error) {
            if (retryCount < this.maxRetries) {
                console.log(`Retrying... (${retryCount + 1}/${this.maxRetries})`);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.fetchWithRetry(url, options, retryCount + 1);
            }
            throw error;
        }
    }
    
    // Autocomplete with fallback
    async autocomplete(query) {
        try {
            const response = await this.fetchWithRetry(
                `${this.backendUrl}${this.endpoints.suggest}?q=${encodeURIComponent(query)}&limit=8`,
                { timeout: 3000 }
            );
            
            if (!response.ok) throw new Error('Autocomplete failed');
            
            return await response.json();
            
        } catch (error) {
            console.error('Autocomplete error:', error);
            // Return fallback suggestions
            return this.getFallbackSuggestions(query);
        }
    }
    
    // Fallback suggestions when backend is down
    getFallbackSuggestions(query) {
        const commonSearches = [
            'Black-owned restaurants near me',
            'Black-owned hair salons',
            'Black-owned businesses',
            'Black-owned clothing stores',
            'Black-owned bookstores',
            'Black-owned coffee shops',
            'Black-owned tech companies',
            'Black-owned beauty supply'
        ];
        
        const filtered = commonSearches.filter(s => 
            s.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
        
        return {
            success: true,
            data: {
                suggestions: filtered.map(text => ({
                    text,
                    type: 'popular'
                }))
            }
        };
    }
    
    // Cache helpers
    getCacheKey(query, options) {
        return JSON.stringify({ query, ...options });
    }
    
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }
    
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }
    
    // Utility
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchFallback;
} else {
    window.SearchFallback = SearchFallback;
}