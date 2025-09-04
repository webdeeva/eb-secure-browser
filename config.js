// Configuration for Everything Black Browser
const config = {
    // Backend API URL - Update this to your deployed backend
    BACKEND_URL: 'https://eb2new-backend-48935.ondigitalocean.app',
    
    // API endpoints
    API_ENDPOINTS: {
        search: '/api/v1/search',
        enhancedSearch: '/api/v1/enhanced-search',
        suggest: '/api/v1/search/suggest',
        businesses: '/api/v1/businesses',
        health: '/api/v1/health',
        debugSearch: '/api/v1/debug/search'
    },
    
    // Search configuration
    SEARCH_CONFIG: {
        defaultLimit: 20,
        maxLimit: 100,
        cacheExpiry: 5 * 60 * 1000, // 5 minutes
        timeout: 10000 // 10 seconds
    },
    
    // Feature flags
    FEATURES: {
        useElasticsearch: true,
        enableAISearch: true,
        enableLocationSearch: true,
        enableAutoComplete: true
    }
};

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else if (typeof window !== 'undefined') {
    window.APP_CONFIG = config;
}