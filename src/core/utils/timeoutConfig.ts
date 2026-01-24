/**
 * Centralized Timeout Configuration - Simplified
 *
 * PHILOSOPHY: Use semantic categories instead of operation-specific names.
 * Most operations fit into a small set of timeout buckets.
 *
 * USAGE:
 * - QUICK: Fast checks, config reads, shell commands (<5s)
 * - NORMAL: Standard API calls, data fetching (<30s)
 * - LONG: Installations, builds, complex operations (<3min)
 * - VERY_LONG: Large downloads, full npm installs (<5min)
 * - EXTENDED: Data ingestion, complete workflows (<10min)
 *
 * SUB-OBJECTS:
 * - UI: CSS-coupled timing (animations, transitions, notifications)
 * - POLL: Polling/retry algorithm inputs
 * - AUTH: Browser authentication flows
 *
 * OVERRIDE: Pass explicit timeout when operation truly differs:
 *   await execute('aio', args, { timeout: 60000 }); // 60s for specific flow
 *
 * BACKWARD COMPATIBILITY:
 * Deprecated aliases are provided for gradual migration. They map to the
 * appropriate semantic category or sub-object value.
 *
 * @example
 * // Preferred: Use semantic categories
 * import { TIMEOUTS } from '@/core/utils/timeoutConfig';
 * await execute(cmd, { timeout: TIMEOUTS.NORMAL });
 *
 * // For UI timing
 * setTimeout(callback, TIMEOUTS.UI.ANIMATION);
 *
 * // For polling
 * const initialDelay = TIMEOUTS.POLL.INITIAL;
 */

export const TIMEOUTS = {
    // =========================================================================
    // Core Operation Categories (5 semantic buckets)
    // =========================================================================

    /** Fast operations: config reads, shell checks, quick validations (5 seconds) */
    QUICK: 5000,

    /** Standard operations: API calls, data loading, list fetching (30 seconds) */
    NORMAL: 30000,

    /** Complex operations: mesh deployment, installations, builds (3 minutes) */
    LONG: 180000,

    /** Large operations: npm installs, component downloads (5 minutes) */
    VERY_LONG: 300000,

    /** Extended operations: data ingestion, full workflows (10 minutes) */
    EXTENDED: 600000,

    // =========================================================================
    // UI Timing Sub-Object (CSS-coupled, must stay granular)
    // =========================================================================

    UI: {
        /** Scroll/fade animations (matches CSS transition duration) */
        ANIMATION: 150,

        /** State settling before DOM operations */
        UPDATE_DELAY: 100,

        /** Step transitions (matches Spectrum component animations) */
        TRANSITION: 300,

        /** User-visible notification duration */
        NOTIFICATION: 2000,

        /** Minimum loading indicator display (prevents flash-of-content) */
        MIN_LOADING: 1500,

        /** Fallback timeout for MutationObserver-based focus management */
        FOCUS_FALLBACK: 1000,
    },

    // =========================================================================
    // Polling/Retry Sub-Object (algorithm inputs, need specific values)
    // =========================================================================

    POLL: {
        /** Initial delay before first poll */
        INITIAL: 500,

        /** Maximum backoff delay for exponential retry */
        MAX: 5000,

        /** Standard polling interval */
        INTERVAL: 1000,

        /** Tight polling for process exit detection */
        PROCESS_CHECK: 100,
    },

    // =========================================================================
    // Auth Sub-Object (browser interaction timeouts)
    // =========================================================================

    AUTH: {
        /** Browser-based authentication flow (1 minute) */
        BROWSER: 60000,

        /** Full OAuth flow with callback (2 minutes) */
        OAUTH: 120000,
    },

    // =========================================================================
    // Operation-Specific Constants (for precise timing requirements)
    // =========================================================================

    /** Minimum timeout for any command (validation threshold) */
    MIN_COMMAND_TIMEOUT: 1000,

    /** Token validation cache TTL (5 minutes) - see CACHE_TTL */
    TOKEN_VALIDATION_TTL: 300000,

    /** Initial wait before first mesh verification poll (20 seconds) */
    MESH_VERIFY_INITIAL_WAIT: 20000,

    /** Interval between mesh verification polls (10 seconds) */
    MESH_VERIFY_POLL_INTERVAL: 10000,

    /** Prerequisites check timeout - reduced for faster failure (10 seconds) */
    PREREQUISITE_CHECK: 10000,

    /** Extract archives timeout (30 seconds) */
    UPDATE_EXTRACT: 30000,

    /** Update message delay (2 seconds) */
    UPDATE_MESSAGE_DELAY: 2000,

    /** Update result display time (3 seconds) */
    UPDATE_RESULT_DISPLAY: 3000,

    /** Demo stop wait time (2 seconds) */
    DEMO_STOP_WAIT: 2000,

    /** Demo status update delay (1 second) */
    DEMO_STATUS_UPDATE_DELAY: 1000,

    /** Webview transition tracking (3 seconds) */
    WEBVIEW_TRANSITION: 3000,

    /** Webview auto-close after project creation (2 minutes) */
    WEBVIEW_AUTO_CLOSE: 120000,

    /** Dashboard open delay (500ms) */
    DASHBOARD_OPEN_DELAY: 500,

    /** Hover suppression delay for layout stabilization (500ms) */
    HOVER_SUPPRESSION_DELAY: 500,

    /** Webview initialization delay (50ms) */
    WEBVIEW_INIT_DELAY: 50,

    /** First progress message update timing (1 second) */
    PROGRESS_MESSAGE_DELAY: 1000,

    /** Second progress message update timing (2 seconds) */
    PROGRESS_MESSAGE_DELAY_LONG: 2000,

    /** Import transition feedback delay (600ms) */
    IMPORT_TRANSITION_FEEDBACK: 600,

    /** Status bar success message duration (5 seconds) */
    STATUS_BAR_SUCCESS: 5000,

    /** Status bar info message duration (3 seconds) */
    STATUS_BAR_INFO: 3000,

    /** Status bar polling interval (5 seconds) */
    STATUS_BAR_UPDATE_INTERVAL: 5000,

    /** Auto-update check interval (4 hours) */
    AUTO_UPDATE_CHECK_INTERVAL: 4 * 60 * 60 * 1000,

    /** Startup update check delay (10 seconds) */
    STARTUP_UPDATE_CHECK_DELAY: 10000,

    /** Programmatic write cleanup timeout (5 seconds) */
    PROGRAMMATIC_WRITE_CLEANUP: 5000,

    /** Project open transition delay (1.5 seconds) */
    PROJECT_OPEN_TRANSITION: 1500,

    /** Graceful shutdown timeout (5 seconds) */
    PROCESS_GRACEFUL_SHUTDOWN: 5000,

    /** File delete retry base delay (100ms) */
    FILE_DELETE_RETRY_BASE: 100,

    /** File handle release wait (500ms) */
    FILE_HANDLE_RELEASE: 500,

    /** File watch timeout (10 seconds) */
    FILE_WATCH_TIMEOUT: 10000,

    /** File watch initial delay (100ms) */
    FILE_WATCH_INITIAL: 100,

    /** File watch max delay (1 second) */
    FILE_WATCH_MAX: 1000,

    /** Project state persist delay (500ms) */
    PROJECT_STATE_PERSIST_DELAY: 500,

    /** Retry initial delay (1 second) */
    RETRY_INITIAL_DELAY: 1000,

    /** Retry max delay (5 seconds) */
    RETRY_MAX_DELAY: 5000,

    /** File retry initial delay (200ms) */
    FILE_RETRY_INITIAL: 200,

    /** File retry max delay (1 second) */
    FILE_RETRY_MAX: 1000,

    /** Progress update interval (1 second) */
    PROGRESS_UPDATE_INTERVAL: 1000,

    /** Token retry base delay (500ms) */
    TOKEN_RETRY_BASE: 500,

    /** Webview retry delay (1 second) */
    WEBVIEW_RETRY_DELAY: 1000,

    /** EDS code sync poll interval (5 seconds) */
    EDS_CODE_SYNC_POLL: 5000,

    /** Rate limit window (1 second) */
    RATE_LIMIT_WINDOW: 1000,

    /** Elapsed time threshold for progress display (30 seconds) */
    ELAPSED_TIME_THRESHOLD: 30000,

    /** Default step duration estimate (10 seconds) */
    DEFAULT_STEP_DURATION: 10000,

    /** Slow command warning threshold (3 seconds) */
    SLOW_COMMAND_THRESHOLD: 3000,

    /** Short operation estimated duration (500ms) */
    PROGRESS_ESTIMATED_DEFAULT_SHORT: 500,

    /** Minimum duration cap for immediate operations (1 second) */
    PROGRESS_MIN_DURATION_CAP: 1000,

    /** Complete project creation workflow (30 minutes) */
    PROJECT_CREATION_OVERALL: 30 * 60 * 1000,

    /** State settling before DOM operations (100ms) */
    UI_UPDATE_DELAY: 100,

    /** Step transitions in wizard (300ms) */
    STEP_TRANSITION: 300,

    /** Step content focus timing (150ms) */
    STEP_CONTENT_FOCUS: 150,

    /** Mesh deployment total timeout (3 minutes) */
    MESH_DEPLOY_TOTAL: 180000,
} as const;

/**
 * Cache TTL (Time To Live) configurations - Simplified
 *
 * Use semantic categories instead of per-cache names.
 *
 * @example
 * cache.set(key, value, { ttl: CACHE_TTL.MEDIUM });
 */
export const CACHE_TTL = {
    // =========================================================================
    // Semantic Categories (3 buckets)
    // =========================================================================

    /** Short-lived cache: frequently changing data (1 minute) */
    SHORT: 60000,

    /** Medium-lived cache: auth status, validation results (5 minutes) */
    MEDIUM: 300000,

    /** Long-lived cache: rarely changing data (1 hour) */
    LONG: 3600000,
} as const;
