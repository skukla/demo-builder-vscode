/**
 * The requests behind the setup guide (AB-26x): mark a step, run the checks.
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
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

type StepState = 'done' | 'dismissed' | 'open';

const log = webviewLogger('SetupGuide');

interface Answer {
    success?: boolean;
    error?: string;
    data?: { items?: SetupChecklistItem[] };
}

/** A step a check run could not check, and why in an SC's words. */
export interface CheckFailure {
    stepId: string;
    reason: string;
}

/**
 * Why a check request that threw could not answer. The client's own throw (its time limit,
 * a lost channel) says nothing an SC can act on, and the extension may well have finished
 * and saved the check after the guide stopped waiting (2026-10-01) — so this says that,
 * the same honest sentence whatever the transport detail was. The detail goes to the
 * webview logger; the extension's own log records what the check itself did.
 */
export const NO_ANSWER =
    "Demo Builder didn't get an answer in time. The check may still have finished; press Check all steps to try again.";

/** Where a check run is: the step being checked, and how far along. */
export interface CheckProgress {
    stepId: string;
    /** 1-based: the step being checked now. */
    position: number;
    total: number;
}

export interface SetupChecklistActions {
    /** Mark one step done or dismissed, or open it again. */
    setStep: (stepId: string, state: StepState) => void;
    /**
     * Check the steps one at a time, in order, so each lands as it is checked. A step that
     * cannot be checked is recorded in `failures` and the run goes on to the next. Answers
     * the checklist as the last answered check saved it.
     */
    checkAll: (stepIds: string[]) => Promise<SetupChecklistItem[] | undefined>;
    /** The step being checked during a run, if one is running. */
    progress?: CheckProgress;
    /** The steps the last run could not check. */
    failures: CheckFailure[];
    /** A request is in flight; the buttons wait. */
    busy: boolean;
    /** Why the last request failed, if it did. */
    error?: string;
}

/**
 * @param componentId - the integration whose checklist this is
 * @returns the actions, whether one is running, and how far a check run is
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
            // The client's own throw is a transport detail; the SC gets a sentence.
            log.warn(`${type} did not answer`, thrown);
            setError("Demo Builder didn't get an answer in time. Try again.");
        } finally {
            setBusy(false);
        }
    }, []);

    const setStep = useCallback(
        (stepId: string, state: StepState) => void run('setSetupStep', { id: componentId, stepId, state }),
        [componentId, run],
    );
    const [progress, setProgress] = useState<CheckProgress>();
    const [failures, setFailures] = useState<CheckFailure[]>([]);
    const checkAll = useCallback(
        async (stepIds: string[]): Promise<SetupChecklistItem[] | undefined> => {
            setBusy(true);
            setError(undefined);
            setFailures([]);
            const failed: CheckFailure[] = [];
            let items: SetupChecklistItem[] | undefined;
            for (const [index, stepId] of stepIds.entries()) {
                setProgress({ stepId, position: index + 1, total: stepIds.length });
                const answer = await checkOne(componentId, stepId);
                if ('reason' in answer) failed.push({ stepId, reason: answer.reason });
                else items = answer.items ?? items;
            }
            setFailures(failed);
            setProgress(undefined);
            setBusy(false);
            return items;
        },
        [componentId],
    );

    return { setStep, checkAll, progress, failures, busy, error };
}

/**
 * One step's check: the checklist it saved, or why it could not be checked. A refusal
 * carries the handler's own sentence; a throw gets {@link NO_ANSWER}.
 */
async function checkOne(
    componentId: string,
    stepId: string,
): Promise<{ items?: SetupChecklistItem[] } | { reason: string }> {
    try {
        const answer = await webviewClient.request<Answer>('checkSetupSteps', { id: componentId, stepId });
        if (answer?.success === false) return { reason: answer.error ?? NO_ANSWER };
        return { items: answer?.data?.items };
    } catch (thrown) {
        log.warn(`check of ${stepId} did not answer`, thrown);
        return { reason: NO_ANSWER };
    }
}
