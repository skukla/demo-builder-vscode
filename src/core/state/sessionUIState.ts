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

export type ViewMode = 'cards' | 'rows';

/**
 * Centralized session UI state
 *
 * All UI toggle and temporary preference state should be consolidated here
 * rather than scattered across module-level variables.
 */
class SessionUIState {
    // Panel visibility toggles
    private _isComponentsViewShown = false;
    private _isLogsViewShown = false;

    // Session preference overrides (override VS Code settings for this session only)
    private _viewModeOverride?: ViewMode;

    // =====================================================
    // Panel visibility state
    // =====================================================

    get isComponentsViewShown(): boolean {
        return this._isComponentsViewShown;
    }

    set isComponentsViewShown(value: boolean) {
        this._isComponentsViewShown = value;
    }

    get isLogsViewShown(): boolean {
        return this._isLogsViewShown;
    }

    set isLogsViewShown(value: boolean) {
        this._isLogsViewShown = value;
    }

    // =====================================================
    // Session preference overrides
    // =====================================================

    /**
     * Get the view mode override for the Projects List
     * Returns undefined if no override is set (use VS Code setting)
     */
    get viewModeOverride(): ViewMode | undefined {
        return this._viewModeOverride;
    }

    /**
     * Set a session-only view mode override
     * This overrides the VS Code setting until extension is reloaded
     */
    set viewModeOverride(value: ViewMode | undefined) {
        this._viewModeOverride = value;
    }

    // =====================================================
    // Utility methods
    // =====================================================

    /**
     * Reset all session UI state
     * Primarily used for testing
     */
    reset(): void {
        this._isComponentsViewShown = false;
        this._isLogsViewShown = false;
        this._viewModeOverride = undefined;
    }

    /**
     * Reset only panel visibility state
     * Useful when closing all panels
     */
    resetPanelState(): void {
        this._isComponentsViewShown = false;
        this._isLogsViewShown = false;
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
