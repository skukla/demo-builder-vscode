/**
 * The demo setup's preview, read when a confirm opens (AB-77, AB-82): what applying the
 * named steps would change, as the store stands now. The confirm in front of a setup step's
 * Apply, or of Apply all, says it (live release test, 2026-10-22). A hook: in the webviews
 * the hooks are the service layer (ADR-017).
 *
 * @module features/dashboard/ui/components/integrations/usePreparationPreview
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { PreparationStepReport } from '@/types/storePreparation';

interface PreviewAnswer {
    success?: boolean;
    error?: string;
    data?: { steps?: PreparationStepReport[] };
}

export interface PreparationPreview {
    /** The steps as the store stands now; null until the read answers. */
    steps: PreparationStepReport[] | null;
    /** Why the read failed, in the SC's words. */
    error?: string;
}

/**
 * @param id - the integration
 * @param stepIds - the steps to preview
 * @returns the steps once read, or why not
 */
export function usePreparationPreview(id: string, stepIds: readonly string[]): PreparationPreview {
    const [steps, setSteps] = useState<PreparationStepReport[] | null>(null);
    const [error, setError] = useState<string>();
    // The ids as one string, so a caller's new array with the same steps reads nothing again.
    const key = stepIds.join('\n');
    useEffect(() => {
        let live = true;
        // Typed on the envelope: a refusal RETURNS { success: false } rather than throwing.
        webviewClient
            .request<PreviewAnswer>('prepareCommerceStore', { id, stepIds: key.split('\n') })
            .then((answer) => {
                if (!live) return;
                if (answer?.success === false) setError(answer.error ?? 'The preview failed.');
                else setSteps(answer?.data?.steps ?? []);
            })
            .catch(() => live && setError("Demo Builder didn't get an answer in time. Try again."));
        return () => {
            live = false;
        };
    }, [id, key]);
    return { steps, error };
}
