/**
 * useComponentOperationProgress Hook
 *
 * The live progress of one integration's operation, for the modal the SC opened by
 * starting it (PL-59). Follows the `componentOperationProgress` push for that id. A
 * modal REOPENED mid-run also asks the extension where the run is now, since the pushes
 * before it were missed; a new run never asks, so it cannot pick up an earlier run's
 * failure.
 *
 * @module features/dashboard/ui/hooks/useComponentOperationProgress
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ComponentOperationProgressPayload } from '@/types/webviewPayloads';

/** What `getComponentOperationProgress` answers: the envelope, not the payload. */
interface ProgressResponse {
    success: boolean;
    data?: ComponentOperationProgressPayload | null;
}

/**
 * @param id - the integration whose operation to follow, or `null` for none
 * @param run - which run of it; a new run starts from nothing
 * @param resume - true when reopened mid-run
 * @returns its latest progress, or `null` before any has arrived
 */
export function useComponentOperationProgress(
    id: string | null,
    run: number,
    resume: boolean,
): ComponentOperationProgressPayload | null {
    const [progress, setProgress] = useState<ComponentOperationProgressPayload | null>(null);

    useEffect(() => {
        setProgress(null);
        if (!id) return undefined;
        let active = true;

        const unsubscribe = webviewClient.onMessage('componentOperationProgress', (data: unknown) => {
            const payload = data as ComponentOperationProgressPayload | undefined;
            if (payload?.id === id) setProgress(payload);
        });

        if (!resume) {
            return () => {
                active = false;
                unsubscribe();
            };
        }

        void webviewClient
            .request<ProgressResponse>('getComponentOperationProgress', { id })
            .then((response) => {
                // A push that already arrived is newer than this answer; keep it.
                if (active && response?.success && response.data) {
                    setProgress((current) => current ?? response.data ?? null);
                }
            })
            .catch(() => {
                // Nothing held for it: the pushes that follow still arrive.
            });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [id, run, resume]);

    return progress;
}
