/**
 * Update's summary and its spot check (step-07 U1, J9-2; the prototype's `UpdateWindow`, walked and
 * passed 2026-11-14). The window titled "Update Luma" with the check's wait, then in the same window
 * the house type table of what the update writes, a tick on each type and Select All over them (every
 * type starts ticked: the update applies everything unless the SC unticks some). Review Records,
 * Cancel and a blue Update (nothing is deleted), greyed while nothing is ticked. No line says the SC's
 * own edits are kept (rule 6): they are the spot check's Kept tab, a type with any wearing the notice
 * dot, as Clear's kept records do. It waits in the small wait window until the check has answered, so it opens
 * at its final size (rules 12 to 14). Its run and result are any job's (`RunPhase`, `ResultPhase`).
 *
 * @module features/data-installer/ui/components/job/UpdateSummary
 */

import React, { useMemo, useState } from 'react';
import { UPDATE } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import { TypeTable } from '../typeSummary/TypeTable';
import type { TypeRow } from './installRows';
import { RecordsWindow } from './RecordsWindow';
import { updateRecords } from './updateRows';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** The types ticked, by code: every type until the SC unticks one. */
export interface UpdatePicks {
    ticked: ReadonlySet<string>;
    toggle: (type: string) => void;
    all: boolean;
    toggleAll: () => void;
}

/**
 * The ticks, kept by the window so they survive Review Records and back. Before the SC touches one,
 * every type the check found is ticked.
 */
export function useUpdatePicks(rows: readonly TypeRow[]): UpdatePicks {
    const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
    const every = useMemo(() => new Set(rows.map((row) => row.type)), [rows]);
    const ticked = chosen ?? every;
    const all = rows.length > 0 && rows.every((row) => ticked.has(row.type));
    const toggle = (type: string): void => {
        const next = new Set(ticked);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        setChosen(next);
    };
    return { ticked, toggle, all, toggleAll: () => setChosen(all ? new Set() : every) };
}

const UPDATE_UNREAD = "What the update would change couldn't be read.";

/** The summary: the check's wait, then the ticked type table, Review Records, Cancel and Update. */
export function UpdateSummary({
    job,
    name,
    picks,
    onClose,
}: {
    job: DatapackJob;
    name: string;
    picks: UpdatePicks;
    onClose: () => void;
}): React.ReactElement {
    const checking = job.state.phase === 'check';
    const chosen = job.rows.filter((row) => picks.ticked.has(row.type)).map((row) => row.type);
    return (
        <StepsWindow
            title={`${UPDATE} ${name}`}
            ready={!checking}
            waiting={checking ? WAIT_STAGES.checkingForChanges : false}
            closeLabel="Cancel"
            startButtons={[{ label: 'Review Records', variant: 'secondary', onPress: job.review }]}
            actionButtons={[
                {
                    label: UPDATE,
                    variant: 'accent',
                    onPress: () => job.startWith({ dataTypes: chosen, ...(job.update.version ? { version: job.update.version } : {}) }),
                    isDisabled: chosen.length === 0,
                },
            ]}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                {/* One block, so the body's gap does not stand between Select All and the boxes it ticks. */}
                <div>
                    <SelectAllRow
                        all={picks.all}
                        some={picks.ticked.size > 0}
                        onToggle={picks.toggleAll}
                    />
                    <TypeTable
                        rows={job.rows}
                        label="What the update writes, by type"
                        picks={{ ticked: picks.ticked, onToggle: picks.toggle }}
                    />
                </div>
                {job.checkFailed ? (
                    <p className="dialog-problem text-notice">{UPDATE_UNREAD}</p>
                ) : null}
            </div>
        </StepsWindow>
    );
}

/** Review Records for an update: what it writes (Changed) and the SC's edits it keeps (Kept). */
export function UpdateRecords({
    job,
    name,
    onClose,
}: {
    job: DatapackJob;
    name: string;
    onClose: () => void;
}): React.ReactElement {
    const { changed, kept } = updateRecords(job.update.changes);
    return (
        <RecordsWindow
            title={`${UPDATE} ${name}`}
            rows={job.rows}
            records={changed}
            reading={false}
            kept={kept}
            firstTab="Changed"
            onBack={job.back}
            onClose={onClose}
        />
    );
}
