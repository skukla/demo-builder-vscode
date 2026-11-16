/**
 * Open the project's Commerce Admin, with the button showing it is working until the browser has
 * started: two or three seconds with no response read as a press that did nothing (owner,
 * 2026-10-31). Asked, not posted: the extension answers once Chrome's window is likely up
 * (`openInIncognito` waits Chrome's usual start). What went wrong, if anything, the handler says
 * itself (a missing URL offers Configure).
 *
 * Shared by the pack's Admin step (`usePackSetupStep`) and the uninstall's "One Step Left" result
 * (walk F153), which offered no way to the Admin at all.
 *
 * @module features/data-installer/ui/hooks/useOpenAdmin
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface OpenAdmin {
    /** The browser is starting: the button shows a spinner. */
    opening: boolean;
    openAdmin: () => void;
}

export function useOpenAdmin(): OpenAdmin {
    const [opening, setOpening] = useState(false);
    const openAdmin = useCallback((): void => {
        setOpening(true);
        void webviewClient
            .request('openAdminPanel', {})
            .catch(() => undefined)
            .finally(() => setOpening(false));
    }, []);
    return { opening, openAdmin };
}
