/**
 * useClearArrival — the Command Palette's Clear doors reaching a project's Datapacks (step 06 C5,
 * P6-Q5): `demoBuilder.clearDemoData` and `demoBuilder.clearCommerceInstance` open the screen with
 * that window open.
 *
 * The projects list's Delete arrival, again (`useListBatch`): a screen just opened takes the held
 * request once mounted (`takeClearRequest`), since the webview client keeps no message for a listener
 * that subscribes late; one already open is pushed `openClearWindow`. Held here, at the screen,
 * rather than in the header, so it outlives the catalog's first load and the Activity view: the
 * header opens it once it is drawn (`CatalogHeaderActions`), then reports it `taken`.
 *
 * The Datapack Library has no Clear, so it neither asks nor listens: asking would use up a request
 * meant for a project's Datapacks.
 *
 * @module features/data-installer/ui/hooks/useClearArrival
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type {
    ClearWindowKind,
    OpenClearWindowPayload,
    TakeClearRequestResponse,
} from '@/types/demoDataWipe';

export interface ClearArrival {
    /** The Clear window asked for and not yet opened. */
    request: ClearWindowKind | null;
    /** The header opened it: forget it, so it opens once. Stable. */
    taken: () => void;
}

/** Only the two windows the header has; anything else opens nothing. */
function kindOf(value: unknown): ClearWindowKind | null {
    return value === 'project' || value === 'instance' ? value : null;
}

/**
 * @param enabled - a project's Datapacks (not the library)
 * @returns the window asked for, and how to say it opened
 */
export function useClearArrival(enabled: boolean): ClearArrival {
    const [request, setRequest] = useState<ClearWindowKind | null>(null);
    useEffect(() => {
        if (!enabled) return;
        // An answer with no data (a refusal, a host that does not know the message) opens nothing.
        webviewClient.request<TakeClearRequestResponse | null | undefined>('takeClearRequest').then(
            (response) => setRequest(kindOf(response?.data?.window)),
            () => undefined,
        );
    }, [enabled]);
    useEffect(() => {
        if (!enabled) return undefined;
        return webviewClient.onMessage('openClearWindow', (data) => {
            const window = kindOf((data as Partial<OpenClearWindowPayload> | undefined)?.window);
            if (window) setRequest(window);
        });
    }, [enabled]);
    const taken = useCallback((): void => setRequest(null), []);
    return { request, taken };
}
