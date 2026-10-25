/**
 * The "Prepare this store" preview, read when a dialog opens (AB-77): every step, or one.
 * Shared by the preview modal and a setup step's Apply confirm, which says what that step's
 * apply would change (live release test, 2026-10-22). A hook: in the webviews the hooks are
 * the service layer (ADR-017).
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
 * @param stepId - one step to preview; every step when absent
 * @returns the steps once read, or why not
 */
export function usePreparationPreview(id: string, stepId?: string): PreparationPreview {
    const [steps, setSteps] = useState<PreparationStepReport[] | null>(null);
    const [error, setError] = useState<string>();
    useEffect(() => {
        let live = true;
        // Typed on the envelope: a refusal RETURNS { success: false } rather than throwing.
        webviewClient
            .request<PreviewAnswer>('prepareCommerceStore', { id, ...(stepId ? { stepIds: [stepId] } : {}) })
            .then((answer) => {
                if (!live) return;
                if (answer?.success === false) setError(answer.error ?? 'The preview failed.');
                else setSteps(answer?.data?.steps ?? []);
            })
            .catch(() => live && setError("Demo Builder didn't get an answer in time. Try again."));
        return () => {
            live = false;
        };
    }, [id, stepId]);
    return { steps, error };
}
