/**
 * The import modal's running job, as words and a request field: whether the request names the
 * library, the wait's words for an import or a removal, and the title a running job is handed to
 * a notification under. Out of `ImportDatapackModal` (2026-11-04) when pulling them out of its
 * function body put the component over its size limit.
 *
 * @module features/data-installer/ui/components/importModalJob
 */

import { busyMessage } from './importModalView';
import type { LastAction } from './importResult';
import type { DatapackStoreName } from '@/types/datapack';

/** Only a library pack names its store; the handler reads absent as the Data Installer. */
export function libraryField(source: DatapackStoreName | undefined): { source?: 'library' } {
    return source === 'library' ? { source } : {};
}

/** The wait's words: an import's, or a removal's with its saving-first stage (step 05). */
export function jobBusyMessage(a: {
    start: boolean;
    reset: boolean;
    pickingUp: boolean;
    lastAction: LastAction | null;
    stage: string | undefined;
}): ReturnType<typeof busyMessage> {
    const importing = a.start || (a.pickingUp && a.lastAction === 'start');
    const removing = a.reset || (a.pickingUp && a.lastAction === 'reset');
    return busyMessage(importing, removing, a.reset ? a.stage : undefined);
}

/** The notification a running job is handed to on close: what it is doing, and to which pack. */
export function backgroundTitle(removing: boolean, displayName: string): string {
    return `${removing ? 'Removing' : 'Importing'} ${displayName}`;
}
