/**
 * The import modal's running job, as words and a request field: whether the request names the
 * library, the wait's words for an import or a removal, and the title a running job is handed to
 * a notification under. Out of `ImportDatapackModal` (2026-11-04) when pulling them out of its
 * function body put the component over its size limit. The target's name and the run's columns
 * moved here from `importModalView` (step 03, S2) to keep that file from growing.
 *
 * @module features/data-installer/ui/components/importModalJob
 */

import type { ImportScopes } from '../hooks/useImportScopes';
import { busyMessage } from './importModalView';
import type { LastAction } from './importResult';
import type { DatapackStoreName } from '@/types/datapack';

/** How often an import window re-reads the recorded job while one is in flight. */
export const STATUS_POLL_MS = 2000;

/** Only a library pack names its store; the handler reads absent as the Data Installer. */
export function libraryField(source: DatapackStoreName | undefined): { source?: 'library' } {
    return source === 'library' ? { source } : {};
}

/** The wait's words: a removal's with its saving-first stage (step 05), or a dry run's. */
export function jobBusyMessage(a: {
    reset: boolean;
    pickingUp: boolean;
    lastAction: LastAction | null;
    stage: string | undefined;
}): ReturnType<typeof busyMessage> {
    const removing = a.reset || (a.pickingUp && a.lastAction === 'reset');
    return busyMessage(removing, a.reset ? a.stage : undefined);
}

/** An import is starting, up to its first record: the window shows its rows rather than a spinner. */
export function isStartingImport(a: { start: boolean; reset: boolean; pickingUp: boolean; lastAction: LastAction | null }): boolean {
    return !a.reset && (a.start || (a.pickingUp && a.lastAction === 'start'));
}

/** The notification a running job is handed to on close: what it is doing, and to which pack. */
export function backgroundTitle(removing: boolean, displayName: string): string {
    return `${removing ? 'Uninstalling' : 'Installing'} ${displayName}`;
}

/** The chosen target by name, "Justrite Test Store US (Justrite Test)", or the instance when unnamed. */
export function targetName(scope: ImportScopes, commerceInstance: string): string {
    const website = scope.websites.find((w) => w.code === scope.websiteCode);
    const store = website?.storeViews.find((v) => v.code === scope.storeCode);
    if (website && store) return `${store.name} (${website.name})`;
    return website?.name ?? commerceInstance;
}

/**
 * The narrowest editor two columns of data types fit in: a large dialog (640px) and the margin
 * Spectrum keeps around it. Below it the dialog is held to the editor's width, and two columns of
 * "Linking product options 12,345 of 12,345" no longer fit side by side.
 */
export const TWO_COLUMN_MIN_VIEWPORT = 720;

/**
 * How many columns the import's data types take, chosen once when the window opens (owner,
 * 2026-11-10, walk F135): two for more than six data types, one for six or fewer, and one when the
 * editor is too narrow for two. Each column is as wide as its longest line, so nothing wraps.
 */
export function runColumns(typeCount: number, viewportWidth: number): 1 | 2 {
    return typeCount > 6 && viewportWidth >= TWO_COLUMN_MIN_VIEWPORT ? 2 : 1;
}
