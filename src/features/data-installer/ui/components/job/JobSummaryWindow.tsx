/**
 * An install's summary window (step 03, S4; the prototype's `SummaryWindow`): the check's wait,
 * then the type table, what installing puts in Commerce, with Review Records, Dry Run and Install
 * (decisions Phase 5, J2-1). A Dry Run waits in the same window. The window stays unseen until the
 * check has answered (`ready`), so it opens at the table's height and never grows (rules 12, 14).
 * No checkbox, no picker: the whole datapack goes to the project's own store.
 *
 * @module features/data-installer/ui/components/job/JobSummaryWindow
 */

import React from 'react';
import { DRY_RUN, INSTALL } from '../../../datapackWords';
import { TypeTable } from '../typeSummary/TypeTable';
import type { TypeRow } from './installRows';
import type { ModalWait } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface JobSummaryWindowProps {
    title: string;
    rows: readonly TypeRow[];
    /** What installing would change could not be read. */
    checkFailed: boolean;
    /** The check has answered: the table is known. */
    ready: boolean;
    waiting: ModalWait | false;
    onReview: () => void;
    onDryRun: () => void;
    onInstall: () => void;
    onClose: () => void;
}

export function JobSummaryWindow({
    title,
    rows,
    checkFailed,
    ready,
    waiting,
    onReview,
    onDryRun,
    onInstall,
    onClose,
}: JobSummaryWindowProps): React.ReactElement {
    return (
        <StepsWindow
            title={title}
            ready={ready}
            waiting={waiting}
            closeLabel="Cancel"
            startButtons={[{ label: 'Review Records', variant: 'secondary', onPress: onReview }]}
            actionButtons={[
                { label: DRY_RUN, variant: 'secondary', onPress: onDryRun },
                { label: INSTALL, variant: 'accent', onPress: onInstall },
            ]}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                <TypeTable rows={rows} />
                {checkFailed ? (
                    <p className="dialog-problem text-notice">
                        {"What installing would change couldn't be read."}
                    </p>
                ) : null}
            </div>
        </StepsWindow>
    );
}
