/**
 * Centralized timeout and cache configuration
 *
 * This file contains all timeout and cache TTL values to avoid magic numbers
 * throughout the codebase and provide a single place to tune performance.
 *
 * TIMEOUTS: Command execution timeout values
 * CACHE_TTL: Cache time-to-live values for performance optimization
 */

export const TIMEOUTS = {
    // Adobe CLI operations
    CONFIG_READ: 10000,             // Reading config values (expiry, other config) - increased for fnm overhead
    TOKEN_READ: 10000,              // Reading JWT tokens (longer due to size)
    CONFIG_WRITE: 10000,            // Writing config values (CRITICAL FIX: increased from 5000ms)
    // Adobe CLI project/workspace selection often takes 8-10 seconds
    API_CALL: 10000,                // API-based commands (console where, org list)
    BROWSER_AUTH: 60000,            // Browser-based authentication flow (1 minute)
    POST_LOGIN_DELAY: 2000,         // Wait for CLI to finish writing config after browser login (2 seconds)
    POST_LOGIN_RETRY_DELAY: 3000,   // Additional delay before retrying org fetch if 0 orgs found (3 seconds)
    API_MESH_CREATE: 120000,        // API Mesh creation (2 minutes)
    API_MESH_UPDATE: 120000,        // API Mesh update/deployment (2 minutes)
    
    // Adobe SDK operations
    SDK_INIT: 5000,                 // Adobe SDK initialization (fail fast, non-critical background operation)

    // Data loading timeouts (wizard UI)
    ORG_LIST: 30000,                // 30 seconds - organization list
    PROJECT_LIST: 30000,            // 30 seconds - project list  
    WORKSPACE_LIST: 30000,          // 30 seconds - workspace list
    PROJECT_DETAILS: 30000,         // 30 seconds - project details
    WORKSPACE_DETAILS: 30000,       // 30 seconds - workspace details

    // Prerequisites timeouts
    PREREQUISITE_CHECK: 60000,      // 1 minute - checking if prerequisite exists (fast)
    PREREQUISITE_INSTALL: 180000,   // 3 minutes - installing prerequisites (downloads, npm installs)

    // Update system timeouts
    UPDATE_CHECK: 10000,            // GitHub API calls to check releases
    UPDATE_DOWNLOAD: 60000,         // Downloading VSIX or component archives (1 minute)
    UPDATE_EXTRACT: 30000,          // Extracting downloaded archives

    // Binary path caching and validation
    BINARY_PATH_CACHE: 5000,        // Caching Node/aio binary paths
    QUICK_CONFIG_CHECK: 2000,       // Fast config validation (non-critical checks)
    NODE_VERSION_TEST: 5000,        // Testing aio-cli installation per Node version
    
    // Homebrew operations
    HOMEBREW_CHECK: 3000,           // Quick Homebrew version check
    
    // Demo operations
    DEMO_START_CHECK: 5000,         // Checking if demo can start/stop
    
    // Validation operations
    COMMERCE_VALIDATION: 10000,     // Adobe Commerce instance validation
    
    // UI timing (delays for user experience, not operation timeouts)
    UI_SHORT_DELAY: 100,            // Quick UI refresh/animation
    UI_MEDIUM_DELAY: 500,           // Short animation delay
    UI_POLLING_DELAY: 1000,         // Status polling interval
    UI_MESSAGE_DISPLAY: 2000,       // Error/info message display duration
    UI_MESSAGE_AUTODISMISS: 3000,   // Auto-dismiss duration for success messages
    
    // Default fallbacks
    COMMAND_DEFAULT: 30000,         // Default command timeout
} as const;

/**
 * Cache TTL (Time To Live) configurations
 * Separate from operation timeouts for clarity
 */
export const CACHE_TTL = {
    // Authentication and session caches
    AUTH_STATUS: 5 * 60 * 1000,     // 5 minutes - authentication status
    VALIDATION: 5 * 60 * 1000,      // 5 minutes - organization access validation

    // API response caches (shorter TTLs for fresher data)
    ORG_LIST: 60 * 1000,            // 1 minute - organization list
    CONSOLE_WHERE: 3 * 60 * 1000,   // 3 minutes - current console context (expensive 2s+ calls)
    PLUGIN_LIST: 5 * 60 * 1000,     // 5 minutes - installed plugins
} as const;