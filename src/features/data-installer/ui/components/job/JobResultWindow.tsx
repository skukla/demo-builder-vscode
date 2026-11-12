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
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';

export interface JobResultWindowProps {
    result: ResultContent;
    actionButtons?: ActionButton[];
    onClose: () => void;
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
}: JobResultWindowProps): React.ReactElement {
    useCloseWhenClean(titleAlone(result) && !actionButtons?.length, onClose);
    return (
        <ResultWindow
            title={result.title}
            status={resultStatus(result)}
            holdsAdminPath={Boolean(result.keptRoot)}
            actionButtons={actionButtons}
            onClose={onClose}
        >
            <DatapackResultBody result={result} />
        </ResultWindow>
    );
}
