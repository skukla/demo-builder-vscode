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
    CONFIG_WRITE: 20000,            // Writing config values (INCREASED: project/workspace selection can take 8-15 seconds)
    // Adobe CLI project/workspace selection often takes 8-10 seconds, but can exceed 10s
    API_CALL: 10000,                // API-based commands (console where, org list)
    BROWSER_AUTH: 60000,            // Browser-based authentication flow (1 minute)
    API_MESH_CREATE: 120000,        // API Mesh creation (2 minutes)
    API_MESH_UPDATE: 120000,        // API Mesh update/deployment (2 minutes)
    MESH_DESCRIBE: 30000,           // Fetching mesh info via describe command (30 seconds)
    MESH_VERIFY_INITIAL_WAIT: 20000, // Initial wait before first verification poll (20 seconds)
    MESH_VERIFY_POLL_INTERVAL: 10000, // Interval between verification polls (10 seconds)
    
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

    // Component installation timeouts
    COMPONENT_CLONE: 120000,        // Cloning git repository (2 minutes)
    COMPONENT_INSTALL: 300000,      // Installing npm dependencies (5 minutes)
    COMPONENT_BUILD: 180000,        // Running build scripts (3 minutes)

    // Update system timeouts
    UPDATE_CHECK: 10000,            // GitHub API calls to check releases
    UPDATE_DOWNLOAD: 60000,         // Downloading VSIX or component archives (1 minute)
    UPDATE_EXTRACT: 30000,          // Extracting downloaded archives
    UPDATE_MESSAGE_DELAY: 2000,     // Delay before showing update notification (2 seconds)
    UPDATE_RESULT_DISPLAY: 3000,    // Display time for update result notification (3 seconds)

    // Demo lifecycle timeouts
    DEMO_STOP_WAIT: 2000,           // Wait time after stopping demo before cleanup (2 seconds)
    DEMO_STATUS_UPDATE_DELAY: 1000, // Delay before refreshing dashboard status after start/stop (1 second)

    // Webview lifecycle timeouts
    WEBVIEW_TRANSITION: 3000,       // 3 seconds - webview transition tracking (prevents race conditions)
    WEBVIEW_AUTO_CLOSE: 120000,     // Auto-close wizard after project creation if user doesn't click Open Project (2 minutes)

    // UI timing delays
    STEP_TRANSITION: 300,           // Step transition animation duration (matches CSS)
    STEP_CONTENT_FOCUS: 300,        // Delay before focusing step content (allows Spectrum components to mount)
    SCROLL_ANIMATION: 150,          // Scroll animation delay for UI smoothness
    FOCUS_FALLBACK: 1000,           // Fallback timeout for MutationObserver-based focus management
    DASHBOARD_OPEN_DELAY: 500,      // Delay before opening dashboard after project creation
    UI_UPDATE_DELAY: 100,           // Small delay for UI updates before subsequent operations
    WEBVIEW_INIT_DELAY: 50,         // Small delay for webview initialization to avoid race conditions (SOP §1)
    PROGRESS_MESSAGE_DELAY: 1000,   // First progress message update timing (SOP §1)
    PROGRESS_MESSAGE_DELAY_LONG: 2000, // Second progress message update timing (SOP §1)

    // UI notification timing (SOP §1 compliance - Round 2)
    STATUS_BAR_SUCCESS: 5000,       // Success message duration in status bar
    STATUS_BAR_INFO: 3000,          // Info message duration in status bar
    STATUS_BAR_UPDATE_INTERVAL: 5000, // Status bar polling interval
    NOTIFICATION_AUTO_DISMISS: 2000,  // Progress notification auto-dismiss

    // Auto-update system (SOP §1 compliance - Round 2)
    AUTO_UPDATE_CHECK_INTERVAL: 4 * 60 * 60 * 1000, // 4 hours - periodic update check
    STARTUP_UPDATE_CHECK_DELAY: 10000,  // 10 seconds - delay at activation

    // File watcher (SOP §1 compliance - Round 2)
    PROGRAMMATIC_WRITE_CLEANUP: 5000,  // Auto-cleanup tracking timeout

    // Project creation (SOP §1 compliance - Round 2)
    PROJECT_OPEN_TRANSITION: 1500,     // Transition delay before open project

    // Shell and system operations
    QUICK_SHELL: 2000,              // Quick shell commands (fnm --version, fnm current)
    PORT_CHECK: 5000,               // Port checking operations (lsof)

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