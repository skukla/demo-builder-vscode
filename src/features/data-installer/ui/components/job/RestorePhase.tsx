/**
 * Restore's check, its question and its save question (step 03, S8; step-07 U1, J9-5 to J9-7, as the
 * walked prototype `j9-restore.tsx` draws them): the window titled "Restore My Luma" with the
 * "Checking for your changes" wait while `restore-datapack` checks without `confirm`, then "Restore
 * My Luma?", small, Cancel and a blue Restore (rule 20), over where Commerce goes back to:
 *
 * - a Demo Builder (or other) datapack: one line, "Commerce goes back to Luma as it ships.";
 * - the SC's own, nothing unsaved: one line naming its original, the only point there is;
 * - the SC's own with unsaved edits: the house RadioGroup, "Last Saved, <date>" (picked first; it
 *   throws the edits away) and "Original, <date>". Last Saved goes straight to the run; Original asks
 *   "Save Your Changes First?" (Restore Without Saving, Cancel, Save and Restore) over the edits by
 *   type, since saving before Last Saved would leave nothing to restore.
 *
 * The question's content is known before it opens, so it opens at its final size and never grows
 * (rules 12 to 14). The run and the result are any job's (`RunPhase`, `ResultPhase`). Split out of
 * `DatapackJobWindow`, which picks it.
 *
 * @module features/data-installer/ui/components/job/RestorePhase
 */

import { Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { RESTORE, saveFirstLabel, withoutSavingLabel } from '../../../datapackWords';
import { versionLabel } from '../../../packVersions';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import { TypeTable } from '../typeSummary/TypeTable';
import { countedRows } from './installRows';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import { ConfirmActionWindow } from '@/core/ui/components/ui/ConfirmActionDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { RestorePoint, RestoreQuestion } from '@/types/webviewRequests';

/** The one line, when there is one point only: as it ships, or the SC's own datapack's original. */
function oneLine(name: string, question: RestoreQuestion): string {
    if (!question.own) return `Commerce goes back to ${name} as it ships.`;
    return `Commerce goes back to ${name}'s original from ${versionLabel(question.own.original)}.`;
}

/** "Restore <pack>?": the choice when there are two points, else the one line. */
function RestoreQuestionWindow({
    job,
    name,
    question,
    onClose,
}: {
    job: DatapackJob;
    name: string;
    question: RestoreQuestion;
    onClose: () => void;
}): React.ReactElement {
    const [point, setPoint] = useState<RestorePoint>('lastSaved');
    const lastSaved = question.own?.lastSaved;
    const restore = (): void => {
        if (!question.own) return job.startWith();
        const to: RestorePoint = lastSaved ? point : 'original';
        // Original over unsaved edits asks to save first (J9-7); anything else runs.
        if (to === 'original' && (question.changes ?? []).length > 0) return job.askSaveFirst();
        return job.startWith({ to });
    };
    const choice =
        question.own && lastSaved ? (
            <RadioGroup
                aria-label={`${RESTORE} ${name} to`}
                value={point}
                onChange={(value) => setPoint(value === 'original' ? 'original' : 'lastSaved')}
            >
                <Radio value="lastSaved">{`Last Saved, ${versionLabel(lastSaved)}`}</Radio>
                <Radio value="original">{`Original, ${versionLabel(question.own.original)}`}</Radio>
            </RadioGroup>
        ) : undefined;
    return (
        <ConfirmActionWindow
            title={`${RESTORE} ${name}?`}
            actionLabel={RESTORE}
            actionVariant="accent"
            onConfirm={restore}
            onClose={onClose}
            {...(choice ? { choice } : {})}
        >
            {choice ? null : oneLine(name, question)}
        </ConfirmActionWindow>
    );
}

/** "Save Your Changes First?" over the SC's unsaved edits, before going back to the original (J9-7). */
export function RestoreSaveFirst({
    job,
    onClose,
}: {
    job: DatapackJob;
    onClose: () => void;
}): React.ReactElement {
    const changes = job.restoreQuestion?.changes ?? [];
    return (
        <SaveFirstWindow
            withoutSavingLabel={withoutSavingLabel(RESTORE)}
            saveLabel={saveFirstLabel(RESTORE, false)}
            onAnswer={(saves) =>
                job.startWith({ to: 'original', changes: saves ? 'keep' : 'drop' })
            }
            onClose={onClose}
        >
            <TypeTable rows={countedRows(changes)} label="Your changes by type of data" />
        </SaveFirstWindow>
    );
}

/** The check's window, or the question's once it answered one. */
export function RestorePhase({
    job,
    name,
    onClose,
}: {
    job: DatapackJob;
    name: string;
    onClose: () => void;
}): React.ReactElement {
    const question = job.restoreQuestion;
    if (job.state.phase === 'question' && question) {
        return (
            <RestoreQuestionWindow job={job} name={name} question={question} onClose={onClose} />
        );
    }
    return (
        <StepsWindow
            title={`${RESTORE} ${name}`}
            // Nothing is shown until the check answers: the small wait window (owner walk, 2026-11-16).
            ready={false}
            waiting={WAIT_STAGES.checkingForChanges}
            closeLabel="Cancel"
            onClose={onClose}
        />
    );
}
