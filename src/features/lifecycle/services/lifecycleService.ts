/**
 * Lifecycle Service
 *
 * Business logic for project lifecycle operations.
 * Extracted from lifecycleHandlers.ts for proper service layer separation.
 *
 * Responsibilities:
 * - Toggling logs panel visibility
 * - Managing UI state for lifecycle operations
 */

import * as vscode from 'vscode';
import { sessionUIState } from '@/core/state/sessionUIState';

/**
 * Toggle the logs output panel
 *
 * Shared utility for toggling the logs panel. Used by both wizard and dashboard.
 * Returns the new visibility state.
 *
 * @returns Promise resolving to the new visibility state (true = shown, false = hidden)
 */
export async function toggleLogsPanel(): Promise<boolean> {
    if (sessionUIState.isLogsViewShown) {
        await vscode.commands.executeCommand('workbench.action.closePanel');
        sessionUIState.isLogsViewShown = false;
    } else {
        await vscode.commands.executeCommand('demoBuilder.showLogs');
        sessionUIState.isLogsViewShown = true;
    }
    return sessionUIState.isLogsViewShown;
}

/**
 * Reset logs view state - for testing only
 *
 * @internal
 * @deprecated Use sessionUIState.reset() instead
 */
export function resetLogsViewState(): void {
    sessionUIState.isLogsViewShown = false;
}
