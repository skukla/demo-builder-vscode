/**
 * Frontend Timeout Constants
 *
 * Mirrors backend TIMEOUTS from @/core/utils/timeoutConfig for use in frontend
 * webview code that cannot import from the extension host.
 *
 * IMPORTANT: Keep these values in sync with the backend timeoutConfig.ts
 *
 * Step 4: Timeout Simplification
 * - Values now align with TIMEOUTS.UI and TIMEOUTS.POLL sub-objects
 * - Comments reference the new semantic structure
 *
 * @see src/core/utils/timeoutConfig.ts for the authoritative backend constants
 */
export const FRONTEND_TIMEOUTS = {
    /**
     * Delay for scroll animations to complete before secondary actions.
     * Matches TIMEOUTS.UI.ANIMATION from backend (150ms).
     */
    SCROLL_ANIMATION: 150,

    /**
     * Delay for UI state updates to settle before DOM operations.
     * Matches TIMEOUTS.UI.UPDATE_DELAY from backend (100ms).
     */
    UI_UPDATE_DELAY: 100,

    /**
     * Standard debounce delay for UI interactions.
     * Same as TIMEOUTS.UI.UPDATE_DELAY from backend (100ms).
     */
    UI_DEBOUNCE: 100,

    /**
     * Delay before continuing prerequisite checks after installation.
     * Matches TIMEOUTS.POLL.INITIAL from backend (500ms).
     */
    CONTINUE_CHECK_DELAY: 500,

    /**
     * Delay for scroll operations to settle before secondary actions.
     * Slightly longer than SCROLL_ANIMATION to ensure completion.
     */
    SCROLL_SETTLE: 200,

    /**
     * Zero-delay for deferring execution to the next event loop tick.
     * Used for ensuring UI state updates complete before navigation actions.
     * Prefer this over raw `setTimeout(fn, 0)` for clarity.
     */
    MICROTASK_DEFER: 0,

    /**
     * Minimum display duration for loading indicators and feedback states.
     * Matches TIMEOUTS.UI.MIN_LOADING from backend (1500ms).
     * Used for copy-to-clipboard feedback, loading spinners, etc.
     */
    LOADING_MIN_DISPLAY: 1500,

    /**
     * Double-click prevention delay for buttons that open external resources.
     * Prevents multiple browser tabs from opening on rapid clicks.
     * Same as TIMEOUTS.POLL.INTERVAL from backend (1000ms).
     */
    DOUBLE_CLICK_PREVENTION: 1000,

    /**
     * Debounce delay for component selection changes.
     * Used by useComponentSelection hook to batch rapid selection changes
     * before updating state and sending to backend.
     * Same as TIMEOUTS.POLL.INITIAL from backend (500ms).
     */
    COMPONENT_DEBOUNCE: 500,
} as const;
