/**
 * What the datapack job window shares about a running job: how often it re-reads the job, whether a
 * request names the library, and how many columns the run's data types take.
 *
 * @module features/data-installer/ui/components/importModalJob
 */

import type { DatapackStoreName } from '@/types/datapack';

/** How often an import window re-reads the recorded job while one is in flight. */
export const STATUS_POLL_MS = 2000;

/** Only a library pack names its store; the handler reads absent as the Data Installer. */
export function libraryField(source: DatapackStoreName | undefined): { source?: 'library' } {
    return source === 'library' ? { source } : {};
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
