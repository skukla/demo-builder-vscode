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
    CONFIG_READ: 5000,              // Reading config values (expiry, other config)
    TOKEN_READ: 10000,              // Reading JWT tokens (longer due to size)
    CONFIG_WRITE: 10000,            // Writing config values (CRITICAL FIX: increased from 5000ms)
    // Adobe CLI project/workspace selection often takes 8-10 seconds
    API_CALL: 10000,                // API-based commands (console where, org list)
    BROWSER_AUTH: 60000,            // Browser-based authentication flow (1 minute)
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
    PREREQUISITE_CHECK: 10000,      // 10 seconds - checking if prerequisite exists (fail fast, Step 1 optimization)
    PREREQUISITE_INSTALL: 180000,   // 3 minutes - installing prerequisites (downloads, npm installs)

    // Update system timeouts
    UPDATE_CHECK: 10000,            // GitHub API calls to check releases
    UPDATE_DOWNLOAD: 60000,         // Downloading VSIX or component archives (1 minute)
    UPDATE_EXTRACT: 30000,          // Extracting downloaded archives
    UPDATE_MESSAGE_DELAY: 2000,     // Delay before showing update notification (2 seconds)
    UPDATE_RESULT_DISPLAY: 3000,    // Display time for update result notification (3 seconds)

    // Demo lifecycle timeouts
    DEMO_STOP_WAIT: 2000,           // Wait time after stopping demo before cleanup (2 seconds)

    // Webview lifecycle timeouts
    WEBVIEW_TRANSITION: 3000,       // 3 seconds - webview transition tracking (prevents race conditions)

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
    AUTH_STATUS_ERROR: 60 * 1000,   // 1 minute - authentication status on error (shorter to allow retry)
    VALIDATION: 5 * 60 * 1000,      // 5 minutes - organization access validation
    TOKEN_INSPECTION: 5 * 60 * 1000,  // 5 minutes - token inspection results

    // API response caches (shorter TTLs for fresher data)
    ORG_LIST: 60 * 1000,            // 1 minute - organization list
    CONSOLE_WHERE: 3 * 60 * 1000,   // 3 minutes - current console context (expensive 2s+ calls)
    PLUGIN_LIST: 5 * 60 * 1000,     // 5 minutes - installed plugins

    // Prerequisite check caches (Step 2: Prerequisite Caching)
    PREREQUISITE_CHECK: 5 * 60 * 1000,  // 5 minutes - prerequisite check results
} as const;