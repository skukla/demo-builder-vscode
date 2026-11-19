/**
 * A datapack job's end buttons and the result window for an end no run came before (step 03, S4, S6
 * and S7), in `JobResultWindow`; a run's end stays in the run's window (walk F222). Split out of `DatapackJobWindow`, which picks it;
 * the run window shares `endButtons`.
 *
 * @module features/data-installer/ui/components/job/ResultPhase
 */

import React from 'react';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import type { ResultContent } from '../importResult';
import type { JobKind } from './datapackJob';
import { JobResultWindow } from './JobResultWindow';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { FIX_WITH_AI, FIX_WITH_AI_HINT } from '@/core/utils/fixWithAi';

/**
 * An end's one action beside Close (rule 16): Retry, or Fix with AI. Retry only on this window's own
 * install, uninstall or update; an update's repeats the update with the types it asked for (step-07 U1).
 */
export function endButtons(job: DatapackJob, result: ResultContent): ActionButton[] {
    const own = job.state.kind === 'install' || job.state.kind === 'uninstall' || job.state.kind === 'update';
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

/** The kinds a refused start goes Back from: those with a summary or question behind it. */
const HAS_SUMMARY: ReadonlySet<JobKind> = new Set<JobKind>(['install', 'switch', 'uninstall']);

/** Back to the summary after a start of the window's own that did not run: the kinds that have one. */
export function backButtons(job: DatapackJob): ActionButton[] {
    const { phase, kind } = job.state;
    return phase === 'ended' && HAS_SUMMARY.has(kind)
        ? [{ label: 'Back', variant: 'secondary', onPress: job.back }]
        : [];
}

/** A result no run came before, in its own window: what a check found; Back after an own start. */
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
    return (
        <JobResultWindow
            key={phase}
            result={result}
            actionButtons={[...backButtons(job), ...endButtons(job, result)]}
            onClose={onClose}
            {...(result.keptRoot && kind === 'uninstall' ? { onCheck: job.retry } : {})}
            {...(job.fixProblem ? { problem: job.fixProblem } : {})}
        />
    );
}
