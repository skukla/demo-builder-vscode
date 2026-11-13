/**
 * Asking a project's Datapacks that is not open yet to open one of its Clear windows: the Command
 * Palette's `demoBuilder.clearDemoData` and `demoBuilder.clearCommerceInstance` (step 06 C5, P6-Q5).
 *
 * The projects list's Delete request again (`deleteWindowRequest.ts`): a panel just created cannot be
 * pushed to, since its React listeners attach after mount and the webview client keeps no message
 * for a listener that subscribes late. So the request is held here, and the screen takes it once it
 * has mounted (`takeClearRequest`). A panel already open is pushed `openClearWindow` instead, by
 * the Datapacks command.
 *
 * @module features/data-installer/handlers/clearWindowRequest
 */

import type { ClearWindowKind, TakeClearRequestResponse } from '@/types/demoDataWipe';
import type { MessageHandler } from '@/types/handlers';

let requested: ClearWindowKind | null = null;

/** Hold a request for the next project's Datapacks that mounts: open this Clear window. */
export function requestClearWindow(window: ClearWindowKind): void {
    requested = window;
}

/** `takeClearRequest`: the Clear window to open, or null; used up either way. */
export const handleTakeClearRequest: MessageHandler<unknown, TakeClearRequestResponse> = async () => {
    const window = requested;
    requested = null;
    return { success: true, data: { window } };
};
