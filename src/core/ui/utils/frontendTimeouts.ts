/**
 * Frontend Timeout Constants
 *
 * Mirrors backend TIMEOUTS from @/core/utils/timeoutConfig for use in frontend
 * webview code that cannot import from the extension host.
 *
 * IMPORTANT: Keep these values in sync with the backend timeoutConfig.ts
 *
 * @see src/core/utils/timeoutConfig.ts for the authoritative backend constants
 */
export const FRONTEND_TIMEOUTS = {
    /**
     * Delay for scroll animations to complete before secondary actions.
     * Matches TIMEOUTS.SCROLL_ANIMATION from backend.
     */
    SCROLL_ANIMATION: 150,

    /**
     * Delay for UI state updates to settle before DOM operations.
     * Matches TIMEOUTS.UI_UPDATE_DELAY from backend.
     */
    UI_UPDATE_DELAY: 100,

    /**
     * Standard debounce delay for UI interactions.
     * Matches TIMEOUTS.UI_DEBOUNCE from backend.
     */
    UI_DEBOUNCE: 100,

    /**
     * Delay before continuing prerequisite checks after installation.
     * Matches TIMEOUTS.PROGRESS_MESSAGE_DELAY from backend.
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
} as const;
