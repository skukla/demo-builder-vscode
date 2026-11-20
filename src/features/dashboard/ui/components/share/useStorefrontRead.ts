/**
 * The one read a demo package dialog makes on open, behind the house wait: an Edge Delivery
 * project's storefront preview, or a headless project's datapack check (walk F230). Share Demo and
 * Save as Package (EDS-72) both open on it.
 *
 * @module features/dashboard/ui/components/share/useStorefrontRead
 */

import { useCallback, useEffect, useState } from 'react';
import { readPreview, type Answer, type StorefrontState } from './demoPackageRequests';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { ShareDatapackChecks } from '@/types/webviewRequests';

/**
 * The datapack check of a project with no storefront to preview: the same check the preview
 * carries (walk F230). A read that fails shows no notice, so the file is never held up by it.
 */
async function readDatapackCheck(): Promise<StorefrontState> {
    try {
        const answer = await webviewClient.request<Answer<ShareDatapackChecks>>('getShareDatapackCheck');
        return { status: 'none', checks: answer.success && answer.data ? answer.data.checks : [] };
    } catch {
        return { status: 'none', checks: [] };
    }
}

/** The storefront as last read, and a read again that keeps the form (Share Datapack's, walk F229). */
export interface Storefront {
    state: StorefrontState;
    /** Read again; the answer replaces the preview only when it is one. Stable. */
    reread: () => void;
}

/**
 * Read on open, and again on request. A read again keeps what is shown until an answer worth
 * showing arrives, so the window and what the SC typed stay put.
 *
 * @param isEds - the project has a storefront of its own to preview
 * @returns the state and the read again
 */
export function useStorefrontState(isEds: boolean): Storefront {
    const [state, setState] = useState<StorefrontState>({ status: 'loading' });
    useEffect(() => {
        let cancelled = false;
        void (isEds ? readPreview() : readDatapackCheck()).then((read) => {
            if (!cancelled) setState(read);
        });
        return () => {
            cancelled = true;
        };
    }, [isEds]);
    const reread = useCallback((): void => {
        void (isEds ? readPreview() : readDatapackCheck()).then((read) => {
            if (read.status !== 'failed') setState(read);
        });
    }, [isEds]);
    return { state, reread };
}
