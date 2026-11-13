/**
 * A datapack job's summary phase (step 03, S4, S6 and S7): the check's wait, the type table and a
 * Dry Run's wait, in `JobSummaryWindow`, framed by what the window was opened for. Split out of
 * `DatapackJobWindow`, which picks it; Review Records borrows its title.
 *
 * @module features/data-installer/ui/components/job/SummaryPhase
 */

import React from 'react';
import { DRY_RUN, INSTALL, installTitle } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import type { Opened } from './jobOpened';
import { JobSummaryWindow } from './JobSummaryWindow';
import { WAIT_STAGES } from '@/core/utils/waitStages';

const CHANGES_UNCHECKED = "Your changes couldn't be checked.";
const PREVIEW_UNREAD = "What installing would change couldn't be read.";
const RECORD_UNREAD = "What the datapack installed couldn't be read.";

/** A question's title: without its question mark while the check reads. */
const asked = (title: string, checking: boolean): string => (checking ? title : `${title}?`);

/**
 * The summary's frame: Install's; or a question, no opening line and the warning icon, over the same
 * table: a switch's blue Switch, another version's blue Install, an uninstall's red Uninstall (rule
 * 20), which has no Review Records.
 */
export function summaryFrame(job: DatapackJob, opened: Opened, checking: boolean) {
    const { name, verb, kind } = opened;
    if (kind === 'install') {
        return {
            title: installTitle(name),
            actionButtons: [
                { label: DRY_RUN, variant: 'secondary' as const, onPress: job.dryRun },
                { label: INSTALL, variant: 'accent' as const, onPress: job.install },
            ],
            problem: job.checkFailed ? PREVIEW_UNREAD : undefined,
            onReview: job.review,
        };
    }
    const uninstall = kind === 'uninstall';
    const title = verb === 'Switch' ? `Switch to ${name}` : `${verb} ${name}`;
    const unread = job.checkFailed ? (uninstall ? RECORD_UNREAD : PREVIEW_UNREAD) : undefined;
    return {
        title: asked(title, checking),
        status: 'warning' as const,
        actionButtons: [
            {
                label: verb,
                variant: uninstall ? ('negative' as const) : ('accent' as const),
                onPress: job.switching.press,
            },
        ],
        problem: job.switching.changes.readFailed ? CHANGES_UNCHECKED : unread,
        ...(uninstall ? {} : { onReview: job.review }),
    };
}

/** The wait the summary shows: the check's, or a Dry Run's. */
function summaryWait(job: DatapackJob) {
    const { phase, kind } = job.state;
    if (phase === 'dry-wait') return WAIT_STAGES.checkingImport;
    if (phase !== 'check') return false;
    return kind === 'install' ? WAIT_STAGES.readingWhatToSelect : WAIT_STAGES.checkingForChanges;
}

/** The summary window: the check's wait, the type table, a Dry Run's wait. */
export function SummaryPhase({
    job,
    opened,
    onClose,
}: {
    job: DatapackJob;
    opened: Opened;
    onClose: () => void;
}): React.ReactElement {
    const checking = job.state.phase === 'check';
    const { problem, ...frame } = summaryFrame(job, opened, checking);
    return (
        <JobSummaryWindow
            {...frame}
            rows={job.rows}
            {...(problem ? { problem } : {})}
            ready={!checking}
            waiting={summaryWait(job)}
            onClose={onClose}
        />
    );
}
