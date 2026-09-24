/**
 * SessionUIState - Centralized session-only UI state management
 *
 * Use this for:
 * - UI toggle state (panels shown/hidden)
 * - Session-only preference overrides
 * - Any state that should persist within a session but clear on extension reload
 *
 * Do NOT use this for:
 * - State that should persist across VS Code restarts (use TransientStateManager)
 * - Project data (use StateManager)
 * - Per-command state (use SharedState in HandlerContext)
 *
 * Lifecycle:
 * - Created when extension activates
 * - Persists across webview recreations within same session
 * - Clears when extension is deactivated/reloaded
 */

import type { ViewMode, ViewModeList } from '@/types/viewMode';

/**
 * Centralized session UI state
 *
 * All UI toggle and temporary preference state should be consolidated here
 * rather than scattered across module-level variables.
 */
class SessionUIState {
    // Panel visibility toggles
    private _isLogsViewShown = false;

    // Session preference overrides (override VS Code settings for this session only):
    // each list's cards/rows choice, held apart — switching one never switches another.
    private _viewModeOverrides: Partial<Record<ViewModeList, ViewMode>> = {};

    // =====================================================
    // Panel visibility state
    // =====================================================

    get isLogsViewShown(): boolean {
        return this._isLogsViewShown;
    }

    set isLogsViewShown(value: boolean) {
        this._isLogsViewShown = value;
    }

    // =====================================================
    // Session preference overrides
    // =====================================================

    /** The list's choice for this session, if the SC made one (over its setting). */
    getViewModeOverride(list: ViewModeList): ViewMode | undefined {
        return this._viewModeOverrides[list];
    }

    /** Keep the list's choice for this session; `undefined` forgets it. */
    setViewModeOverride(list: ViewModeList, value: ViewMode | undefined): void {
        if (value === undefined) {
            delete this._viewModeOverrides[list];
        } else {
            this._viewModeOverrides[list] = value;
        }
    }

    // =====================================================
    // Utility methods
    // =====================================================

    /**
     * Reset all session UI state
     * Primarily used for testing
     */
    reset(): void {
        this._isLogsViewShown = false;
        this._viewModeOverrides = {};
    }
}

/**
 * Singleton instance of SessionUIState
 *
 * Import this to access session UI state:
 * ```typescript
 * import { sessionUIState } from '@/core/state/sessionUIState';
 *
 * // Toggle logs panel
 * sessionUIState.isLogsViewShown = !sessionUIState.isLogsViewShown;
 *
 * // Set view mode override
 * sessionUIState.viewModeOverride = 'cards';
 * ```
 */
export const sessionUIState = new SessionUIState();
