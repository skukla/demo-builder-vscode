/**
 * A datapack job's small result (step 03, S4): the clean end, "Bodea Installed", which closes itself
 * when its title says it all (rule 17, `useCloseWhenClean`); a start that never ran ("Couldn't
 * Install Bodea" with the refusal, Back to the summary); and no Commerce instance. Lines left to
 * read keep it open, as today's ending rules do (the plan parks Q3 and Q8).
 *
 * @module features/data-installer/ui/components/job/JobResultWindow
 */

import React from 'react';
import { DatapackResultBody } from '../DatapackResultBody';
import { type ResultContent, resultStatus } from '../importResult';
import { useOpenAdmin } from '../../hooks/useOpenAdmin';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';

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

/** A success with nothing to read or do: its title says it all. */
function titleAlone(result: ResultContent): boolean {
    return (
        result.variant === 'success' &&
        !result.message &&
        !result.details?.length &&
        !result.keptRoot
    );
}

export function JobResultWindow({
    result,
    actionButtons,
    onClose,
    problem,
    onCheck,
}: JobResultWindowProps): React.ReactElement {
    useCloseWhenClean(titleAlone(result) && !actionButtons?.length, onClose);
    // The Admin step a removal left has its way to the Admin, as the install's step does (walk F153).
    const { opening, openAdmin } = useOpenAdmin();
    const admin: ActionButton[] = result.keptRoot
        ? [
              { label: 'Open Admin', variant: 'secondary', onPress: openAdmin, isPending: opening },
              ...(onCheck ? [{ label: 'Check', variant: 'accent' as const, onPress: onCheck }] : []),
          ]
        : [];
    return (
        <ResultWindow
            title={result.title}
            status={resultStatus(result)}
            holdsAdminPath={Boolean(result.keptRoot)}
            actionButtons={[...admin, ...(actionButtons ?? [])]}
            onClose={onClose}
        >
            <DatapackResultBody result={result} />
            {problem ? <p className="dialog-problem text-notice">{problem}</p> : null}
        </ResultWindow>
    );
}
