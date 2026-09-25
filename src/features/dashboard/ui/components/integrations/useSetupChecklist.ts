/**
 * The requests behind the flyout's setup checklist (AB-26x): mark a step, run the checks.
 *
 * The checklist itself arrives on the card model from the saved state
 * (`setupChecklist.ts`); these only change that state, and the extension's snapshot push
 * redraws the flyout. A hook rather than calls in the component: in the webviews the hooks
 * are the service layer (ADR-017).
 *
 * @module features/dashboard/ui/components/integrations/useSetupChecklist
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

type StepState = 'done' | 'dismissed' | 'open';

interface Answer {
    success?: boolean;
    error?: string;
}

export interface SetupChecklistActions {
    /** Mark one step done or dismissed, or open it again. */
    setStep: (stepId: string, state: StepState) => void;
    /** Run the checks Demo Builder can do itself. */
    check: () => void;
    /** A request is in flight; the buttons wait. */
    busy: boolean;
    /** Why the last request failed, if it did. */
    error?: string;
}

/**
 * @param componentId - the integration whose checklist this is
 * @returns the two actions, and whether one is running
 */
export function useSetupChecklist(componentId: string): SetupChecklistActions {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const run = useCallback(async (type: string, payload: Record<string, unknown>) => {
        setBusy(true);
        setError(undefined);
        try {
            // Typed on the envelope: a refusal RETURNS { success: false } rather than throwing.
            const answer = await webviewClient.request<Answer>(type, payload);
            if (answer?.success === false) setError(answer.error ?? 'The request failed.');
        } catch (thrown) {
            setError(thrown instanceof Error ? thrown.message : String(thrown));
        } finally {
            setBusy(false);
        }
    }, []);

    const setStep = useCallback(
        (stepId: string, state: StepState) => void run('setSetupStep', { id: componentId, stepId, state }),
        [componentId, run],
    );
    const check = useCallback(() => void run('checkSetupSteps', { id: componentId }), [componentId, run]);

    return { setStep, check, busy, error };
}
