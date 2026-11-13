/**
 * An install's summary window (step 03, S4; the prototype's `SummaryWindow`): the check's wait,
 * then the type table, what installing puts in Commerce, with Review Records, Dry Run and Install
 * (decisions Phase 5, J2-1). A Dry Run waits in the same window. The window stays unseen until the
 * check has answered (`ready`), so it opens at the table's height and never grows (rules 12, 14).
 * No checkbox, no picker: the whole datapack goes to the project's own store.
 *
 * A switch asks over the same table (S6, decisions J2-3, J8-1): "Switch to Bodea?" with the warning
 * icon and a blue Switch, no opening line; an uninstall asks "Uninstall My Luma?" over what its
 * record lists, a red Uninstall and no Review Records (S7, J5-1). The host hands in the frame's
 * buttons and problem line.
 *
 * @module features/data-installer/ui/components/job/JobSummaryWindow
 */

import React from 'react';
import { TypeTable } from '../typeSummary/TypeTable';
import type { TypeRow } from './installRows';
import type { ActionButton, ModalStatus, ModalWait } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface JobSummaryWindowProps {
    title: string;
    /** A switch's warning icon. */
    status?: ModalStatus;
    rows: readonly TypeRow[];
    /** What could not be read, as the problem line under the table says it. */
    problem?: string;
    /** The check has answered: the table is known. */
    ready: boolean;
    waiting: ModalWait | false;
    /** Review Records; an uninstall's question has none. */
    onReview?: () => void;
    /** Dry Run and Install; or the question's one action. */
    actionButtons: ActionButton[];
    onClose: () => void;
}

export function JobSummaryWindow({
    title,
    status,
    rows,
    problem,
    ready,
    waiting,
    onReview,
    actionButtons,
    onClose,
}: JobSummaryWindowProps): React.ReactElement {
    return (
        <StepsWindow
            title={title}
            {...(status ? { status } : {})}
            ready={ready}
            waiting={waiting}
            closeLabel="Cancel"
            startButtons={onReview ? [{ label: 'Review Records', variant: 'secondary', onPress: onReview }] : []}
            actionButtons={actionButtons}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                <TypeTable rows={rows} />
                {problem ? <p className="dialog-problem text-notice">{problem}</p> : null}
            </div>
        </StepsWindow>
    );
}
