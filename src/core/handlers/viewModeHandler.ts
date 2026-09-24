/**
 * `setViewModeOverride` — a list's cards/rows toggle, kept for the session.
 *
 * One handler for every list that offers the toggle, registered on each
 * surface's map under the same message name; the payload says WHICH list. The
 * webview has already switched by the time this arrives, so it is
 * fire-and-forget; the next open of that surface reads the choice back through
 * `resolveViewMode` in its init payload.
 *
 * @module core/handlers/viewModeHandler
 */

import { sessionUIState } from '@/core/state/sessionUIState';
import type { MessageHandler } from '@/types/handlers';
import type { ViewMode, ViewModeList } from '@/types/viewMode';
import type { SetViewModeOverridePayload } from '@/types/webviewRequests';

const LISTS: readonly ViewModeList[] = ['projects', 'integrations'];
const MODES: readonly ViewMode[] = ['cards', 'rows'];

function isList(value: unknown): value is ViewModeList {
    return typeof value === 'string' && (LISTS as readonly string[]).includes(value);
}

function isMode(value: unknown): value is ViewMode {
    return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export const handleSetViewModeOverride: MessageHandler<SetViewModeOverridePayload> = async (
    _context,
    payload,
) => {
    if (isList(payload?.list) && isMode(payload?.viewMode)) {
        sessionUIState.setViewModeOverride(payload.list, payload.viewMode);
    }
    return { success: true };
};
