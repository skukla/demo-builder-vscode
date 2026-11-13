/**
 * A datapack job's end buttons and its small result window (step 03, S4, S6 and S7): a clean end, or
 * a start that never ran, in `JobResultWindow`. Split out of `DatapackJobWindow`, which picks it;
 * the run window shares `endButtons`.
 *
 * @module features/data-installer/ui/components/job/ResultPhase
 */

import React from 'react';
import { FIX_WITH_AI, FIX_WITH_AI_HINT } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import type { ResultContent } from '../importResult';
import { JobResultWindow } from './JobResultWindow';
import type { ActionButton } from '@/core/ui/components/ui/Modal';

/** An end's one action beside Close (rule 16): Retry, or Fix with AI. Retry only on this window's own install or uninstall. */
export function endButtons(job: DatapackJob, result: ResultContent): ActionButton[] {
    const own = job.state.kind === 'install' || job.state.kind === 'uninstall';
    if (result.action === 'retry' && own)
        return [{ label: 'Retry', variant: 'accent', onPress: job.retry }];
    if (result.action === 'fix')
        return [
            {
                label: FIX_WITH_AI,
                variant: 'accent',
                onPress: job.fixWithAi,
                hint: FIX_WITH_AI_HINT,
            },
        ];
    return [];
}

/** A result in the small window: a clean end, a start that never ran; Back after an own start. */
export function ResultPhase({
    job,
    result,
    onClose,
}: {
    job: DatapackJob;
    result: ResultContent;
    onClose: () => void;
}): React.ReactElement {
    const { phase, kind } = job.state;
    const back: ActionButton[] =
        phase === 'ended' && kind !== 'watch'
            ? [{ label: 'Back', variant: 'secondary', onPress: job.back }]
            : [];
    return (
        <JobResultWindow
            key={phase}
            result={result}
            actionButtons={[...back, ...endButtons(job, result)]}
            onClose={onClose}
        />
    );
}
