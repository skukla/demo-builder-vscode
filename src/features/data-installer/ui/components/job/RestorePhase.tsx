/**
 * Restore's check and its question (step 03, S8; decisions J4-2, J4-3): the window titled "Restore
 * My Luma" with the "Checking for your changes" wait while `restore-datapack` checks without
 * `confirm`, then, over unsaved edits, "Restore My Luma?". The run and the result are any job's
 * (`RunPhase`, `ResultPhase`). Split out of `DatapackJobWindow`, which picks it.
 *
 * @module features/data-installer/ui/components/job/RestorePhase
 */

import React from 'react';
import { RESTORE } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import { ConfirmActionWindow } from '@/core/ui/components/ui/ConfirmActionDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/**
 * What Restore asks over unsaved edits (J4-3): Cancel and Restore only, no "Save Your Changes
 * First?" (a save leaves nothing to restore); blue, as red is for deleting (rule 20).
 */
function restoreQuestion(name: string) {
    return {
        title: `${RESTORE} ${name}?`,
        actionLabel: RESTORE,
        actionVariant: 'accent' as const,
        children: `Commerce goes back to ${name} as you last saved it. Anything you changed since is lost.`,
    };
}

/** The check's window, or the question's once it found unsaved edits. Restore sends it confirmed. */
export function RestorePhase({
    job,
    name,
    onClose,
}: {
    job: DatapackJob;
    name: string;
    onClose: () => void;
}): React.ReactElement {
    if (job.state.phase === 'question') {
        return (
            <ConfirmActionWindow
                {...restoreQuestion(name)}
                onConfirm={job.install}
                onClose={onClose}
            />
        );
    }
    return (
        <StepsWindow
            title={`${RESTORE} ${name}`}
            waiting={WAIT_STAGES.checkingForChanges}
            closeLabel="Cancel"
            onClose={onClose}
        />
    );
}
