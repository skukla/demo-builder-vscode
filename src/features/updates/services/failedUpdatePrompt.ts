/**
 * The prompt Fix with AI opens on an update the Updates window could not apply (owner,
 * 2026-11-19): which project, which update, what it said, and what to do. The AI gets the update
 * applied, then the SC presses Check Again, as Prerequisites' Recheck follows an install.
 *
 * Built from the extension's own record of the run (`failedUpdateRows.ts`), never from words the
 * webview sends. The clash prompt (`fixWithAi.ts`) is the other Fix with AI here: it hands over a
 * kept merge clash with its files, which this does not have.
 *
 * @module features/updates/services/failedUpdatePrompt
 */

import type { PendingUpdateRow } from '@/types/pendingUpdates';

/**
 * @param row - the update, as the Updates window showed it
 * @param message - why it did not apply, as the run said
 * @returns the prompt for the SC's AI
 */
export function failedUpdatePrompt(row: PendingUpdateRow, message: string): string {
    const what = row.detail ? `${row.label} (${row.detail})` : row.label;
    return [
        `Demo Builder's Updates window could not apply an update to the Demo Builder project ${row.group.title}, in ${row.group.key}.`,
        `- The update: ${what}`,
        `- What it said: ${message}`,
        '',
        'Find the cause: read what Demo Builder logged with read_debug_logs, and look at the project ' +
            'and its storefront repository. Fix it where it lives, then apply the update with ' +
            'apply_updates. Tell me what you found, what you changed, and whether the update applied. ' +
            "I will press Check Again in the Updates window when you're done.",
    ].join('\n');
}
