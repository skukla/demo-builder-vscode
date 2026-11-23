/**
 * A datapack job's result window when no run came before it (step 03, S4): what a check found
 * ("Bodea" over "Up to Date"), a start that never ran ("Couldn't Install" with the refusal, Back to
 * the summary), and no Commerce instance. A run's end stays in the run's window
 * (`DatapackRunWindow`; owner, 2026-11-17, walk F222). Every result waits for Close (walk F195).
 *
 * @module features/data-installer/ui/components/job/JobResultWindow
 */

import React from 'react';
import { useOpenAdmin } from '../../hooks/useOpenAdmin';
import { datapackResultWords, KeptRootFacts } from '../datapackResultWords';
import type { ResultContent } from '../importResult';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';

export interface JobResultWindowProps {
    result: ResultContent;
    actionButtons?: ActionButton[];
    onClose: () => void;
    /** Fix with AI had nothing to fix: the extension's refusal, on the problem line (step-07 P5). */
    problem?: string;
    /**
     * The Admin step's Check: runs the uninstall again, which takes the category out once the store
     * no longer uses it, or ends on the same step (walk F153).
     */
    onCheck?: () => void;
}

/**
 * The Admin step a removal left has its way to the Admin, as the install's step does, and its Check
 * (walk F153): in this window and in the run's.
 *
 * @param result - the end
 * @param onCheck - runs the uninstall again, when it can
 * @returns the buttons, none without a kept root
 */
export function useKeptRootButtons(result: ResultContent | null, onCheck?: () => void): ActionButton[] {
    const { opening, openAdmin } = useOpenAdmin();
    if (!result?.keptRoot) return [];
    return [
        { label: 'Open Admin', variant: 'secondary', onPress: openAdmin, isPending: opening },
        ...(onCheck ? [{ label: 'Check', variant: 'accent' as const, onPress: onCheck }] : []),
    ];
}

export function JobResultWindow({
    result,
    actionButtons,
    onClose,
    problem,
    onCheck,
}: JobResultWindowProps): React.ReactElement {
    const admin = useKeptRootButtons(result, onCheck);
    return (
        <ResultWindow
            {...datapackResultWords(result)}
            holdsAdminPath={Boolean(result.keptRoot)}
            actionButtons={[...admin, ...(actionButtons ?? [])]}
            onClose={onClose}
        >
            <KeptRootFacts result={result} />
            {problem ? <p className="dialog-problem text-notice">{problem}</p> : null}
        </ResultWindow>
    );
}
