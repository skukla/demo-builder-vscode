/**
 * Asking a projects list that is not open yet to open its Delete window on one project: the
 * project dashboard's Delete (step-05 S4, owner 2026-11-13, P5-Q2).
 *
 * The same shape as the Updates request (`updatesModalRequest.ts`): a panel just created cannot be
 * pushed to, since its React listeners attach after mount and the webview client keeps no message
 * for a listener that subscribes late. So the request is held here, and the screen takes it once
 * it has mounted (`takeDeleteRequest`). A panel already open is pushed `openDeleteWindow` instead,
 * by the projects list command.
 *
 * @module features/projects-dashboard/handlers/deleteWindowRequest
 */

import type { MessageHandler } from '@/types/handlers';
import type { TakeDeleteRequestResponse } from '@/types/projectsBatch';

let requested: string | null = null;

/** Hold a request for the next projects list that mounts: open the Delete window on this project. */
export function requestDeleteWindow(projectPath: string): void {
    requested = projectPath;
}

/** `takeDeleteRequest`: the project to open the Delete window on, or null; used up either way. */
export const handleTakeDeleteRequest: MessageHandler<unknown, TakeDeleteRequestResponse> = async () => {
    const projectPath = requested;
    requested = null;
    return { success: true, data: { projectPath } };
};
