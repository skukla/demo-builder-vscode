/**
 * Asking a projects list that is not open yet to show the Updates modal (PL-80).
 *
 * A panel just created cannot be pushed to: its React listeners attach after mount, and
 * the webview client keeps no message for a listener that subscribes late. So the request
 * is held here, and the screen takes it once it has mounted (`takeUpdatesRequest`), with
 * the rows Check for Updates presented (`presentUpdates`). A panel already open is pushed
 * `showUpdates` with those rows instead, by the projects list command.
 *
 * @module features/updates/handlers/updatesModalRequest
 */

import { presentedRows } from './updatesModalHandlers';
import type { MessageHandler } from '@/types/handlers';
import type { TakeUpdatesRequestResponse } from '@/types/pendingUpdates';

let requested = false;

/** Hold a request for the next projects list that mounts. */
export function requestUpdatesModal(): void {
    requested = true;
}

/** `takeUpdatesRequest`: the rows to show now, or null; the request is used up either way. */
export const handleTakeUpdatesRequest: MessageHandler<unknown, TakeUpdatesRequestResponse> = async () => {
    const show = requested;
    requested = false;
    const rows = presentedRows();
    return { success: true, data: { rows: show && rows.length > 0 ? rows : null } };
};
