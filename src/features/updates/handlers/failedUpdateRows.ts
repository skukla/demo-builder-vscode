/**
 * What the Updates window's last runs could not apply, by the id the screen knows each row by
 * (owner, 2026-11-19: a failed update is fixed in place, as Prerequisites installs a missing
 * tool). Fix with AI builds its prompt from this record, never from words the webview sends, and
 * Check Again finds the rows to check here.
 *
 * Held for the list the window was handed: a new list (`presentUpdates`) forgets it.
 *
 * @module features/updates/handlers/failedUpdateRows
 */

import type { PendingUpdateRow, UpdateRowState } from '@/types/pendingUpdates';

/** A row a run tried, and why it did not apply when it did not. */
interface TriedRow {
    row: PendingUpdateRow;
    failed?: string;
}

const tried = new Map<string, TriedRow>();

/** The rows a run is about to try, as the screen shows them. */
export function rememberTried(rows: readonly PendingUpdateRow[]): void {
    for (const row of rows) tried.set(row.id, { row });
}

/** A row's outcome: a failure is kept with its reason, anything else clears one. */
export function recordOutcome(id: string, state: UpdateRowState, message?: string): void {
    const entry = tried.get(id);
    if (!entry || state === 'running' || state === 'waiting') return;
    tried.set(
        id,
        state === 'failed'
            ? { row: entry.row, failed: message ?? 'No reason was given.' }
            : { row: entry.row },
    );
}

/** A row a run tried and could not apply, with why; undefined for any other. */
export function failedRow(id: string): { row: PendingUpdateRow; message: string } | undefined {
    const entry = tried.get(id);
    return entry?.failed === undefined ? undefined : { row: entry.row, message: entry.failed };
}

/** A row a run tried, failed or not. */
export function triedRow(id: string): PendingUpdateRow | undefined {
    return tried.get(id)?.row;
}

/** A new list: the last one's rows no longer name anything on screen. */
export function forgetTried(): void {
    tried.clear();
}
