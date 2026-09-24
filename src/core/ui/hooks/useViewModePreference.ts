/**
 * The cards/rows choice of one list, held in the webview and kept for the
 * session by the extension.
 *
 * `choose` is the toggle: it switches the view and tells the extension
 * (`setViewModeOverride`), so the surface reopens the same way. `adopt` is for
 * a view the EXTENSION announces — the init payload, a `configChanged` push —
 * which must not be echoed back as a choice.
 *
 * Extracted 2026-09-24: the projects list and the integrations screen had each
 * written this state and this post by hand.
 *
 * @param list - which list this is (`'projects'`, `'integrations'`)
 * @param initial - the view the init payload named; cards when it named none
 */

import { useCallback, useMemo, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ViewMode, ViewModeList } from '@/types/viewMode';
import type { SetViewModeOverridePayload } from '@/types/webviewRequests';

export interface ViewModePreference {
    viewMode: ViewMode;
    /** The SC's toggle: switch, and keep it for the session. */
    choose: (mode: ViewMode) => void;
    /** A view the extension announced: switch without echoing it back. */
    adopt: (mode: ViewMode) => void;
}

export function useViewModePreference(
    list: ViewModeList,
    initial: ViewMode | undefined = 'cards',
): ViewModePreference {
    const [viewMode, setViewMode] = useState<ViewMode>(initial ?? 'cards');
    const choose = useCallback(
        (mode: ViewMode): void => {
            setViewMode(mode);
            const payload: SetViewModeOverridePayload = { list, viewMode: mode };
            webviewClient.postMessage('setViewModeOverride', payload);
        },
        [list],
    );
    const adopt = useCallback((mode: ViewMode): void => setViewMode(mode), []);
    // One object per (viewMode, list): a consumer may hand it to an effect as a whole.
    return useMemo(() => ({ viewMode, choose, adopt }), [viewMode, choose, adopt]);
}
