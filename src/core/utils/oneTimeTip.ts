/**
 * One-Time Tip Utility
 *
 * Shows a VS Code information notification exactly once, tracked via globalState.
 * Used for non-blocking tips that offer to save settings or open configuration.
 *
 * Pattern: check globalState → mark as shown → fire-and-forget notification.
 * Used by: DA.live org save tip, EDS cleanup settings tip, block library defaults tip.
 */

import * as vscode from 'vscode';

interface OneTimeTipOptions {
    /** globalState key to track whether this tip has been shown */
    stateKey: string;
    /** The notification message */
    message: string;
    /** Action button labels to display */
    actions: string[];
    /** Called when the user selects an action button */
    onAction?: (selection: string) => void;
}

/**
 * Show a one-time informational tip tracked via VS Code globalState.
 *
 * Non-blocking: the notification is shown via fire-and-forget `.then()`,
 * so it never delays the caller. Marks the tip as shown immediately
 * to prevent concurrent calls from double-firing.
 *
 * @param globalState - VS Code Memento (typically `context.globalState`)
 * @param options - Tip configuration
 * @returns `true` if the tip was shown, `false` if it was already shown before
 */
export function showOneTimeTip(
    globalState: vscode.Memento,
    options: OneTimeTipOptions,
): boolean {
    const tipShown = globalState.get<boolean>(options.stateKey, false);
    if (tipShown) {
        return false;
    }

    // Mark as shown immediately so concurrent calls don't double-fire
    globalState.update(options.stateKey, true);

    // Fire-and-forget notification
    vscode.window.showInformationMessage(options.message, ...options.actions)
        .then(selection => {
            if (selection && options.onAction) {
                options.onAction(selection);
            }
        });

    return true;
}
