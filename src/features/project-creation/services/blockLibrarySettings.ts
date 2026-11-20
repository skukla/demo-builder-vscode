/**
 * The shortcut to the custom block libraries setting, `open-block-library-settings`.
 *
 * Two screens send it: the creation wizard's library picker and Configure's Block Libraries
 * tab, which reuses that picker (EDS-39). Both registered the same three lines until walk
 * F271; this is the one body they share.
 *
 * @module features/project-creation/services/blockLibrarySettings
 */

import * as vscode from 'vscode';
import type { HandlerResponse } from '@/types/handlers';

/**
 * Open VS Code settings filtered to `demoBuilder.blockLibraries.custom`. The settings
 * editor opens on its own; nothing waits on it.
 *
 * @returns success, always
 */
export function openCustomBlockLibrarySettings(): HandlerResponse {
    void vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'demoBuilder.blockLibraries.custom',
    );
    return { success: true };
}
