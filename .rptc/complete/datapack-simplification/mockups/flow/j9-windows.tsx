/**
 * J9 prototype: Update Luma, the flyout's main action on a Demo Builder datapack that has a newer
 * version (decisions, "Back on track (owner, 2026-11-14)": "Update means apply what changed. Restore
 * means go back to a previous state."). Each window is the size of what it shows (rules 12 to 14):
 *
 *   the check (Install's check window and wait, under the button's own words)
 *   → nothing left to apply: "Luma Is Up to Date", which closes itself (as Restore's check ends, J4-2)
 *   → what changed: the type table, a tick on each type, Review Records, Cancel and Update (blue)
 *       → Review Records: the spot check, Changed and Kept tabs, Back only (rule 19)
 *       → Update: the run (J3's run window: one Update Luma step, a row per chosen type, then Verify)
 *       → the small result "Luma Updated", which closes itself (rules 17, 21)
 *
 * Every run ends clean here, as J3's and J4's do: J2-2 already judged how a run with a problem ends.
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { useTraceLast } from './j2-parts';
import { useRunTick } from './j2-windows';
import { RunWindow } from './j3-windows';
import { RecordsStep, TypeTable, reviewButton } from './TypeSummary';
import { LUMA_PACK } from './scenarioInstall';
import { changesLeft, updateRows, updateRun } from './scenarioUpdate';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** Where an Update window starts: the check (J9-2, J9-4), or the run with every type chosen (J9-3). */
export type UpdateStart = 'check' | 'run';

/** What is on screen. Each is its own window, bar the check, which becomes the summary in place. */
type Phase = 'check' | 'form' | 'records' | 'run' | 'updated' | 'up-to-date';

const TITLE = `Update ${LUMA_PACK}`;

/** The job's state: the phase, the ticks, the run's clock. `onUpdated` once the chosen types are in. */
function useUpdate(start: UpdateStart, left: readonly string[], onUpdated: (codes: string[]) => void) {
    const changes = changesLeft(left);
    const [phase, setPhase] = useState<Phase>(start);
    // Every changed type starts ticked: the update applies everything unless the SC unticks some.
    const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(changes.map((c) => dataTypeLabel(c.code))));
    const [applied, setApplied] = useState<string[]>(() => changes.map((c) => c.code));
    const [started, setStarted] = useState({ id: 0, at: Date.now() });
    const run = updateRun(applied);
    const tick = useRunTick(phase === 'run', run.last, started.id);
    const ended = phase === 'run' && tick >= run.last;
    useTraceLast(`Update: ${phase}`);
    const update = (): void => {
        setApplied(changes.filter((c) => ticked.has(dataTypeLabel(c.code))).map((c) => c.code));
        setStarted((s) => ({ id: s.id + 1, at: Date.now() }));
        setPhase('run');
    };
    const toggle = (type: string): void =>
        setTicked((now) => {
            const next = new Set(now);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    const all = changes.length > 0 && ticked.size === changes.length;
    const toggleAll = (): void => setTicked(all ? new Set() : new Set(changes.map((c) => dataTypeLabel(c.code))));
    // After the check: nothing left ends there (as Restore's does, J4-2); else what changed.
    useEffect(() => {
        if (phase !== 'check') return undefined;
        const t = setTimeout(() => setPhase(changes.length ? 'form' : 'up-to-date'), window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!ended) return;
        onUpdated(applied);
        setPhase('updated');
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    return { changes, phase, setPhase, ticked, toggle, all, toggleAll, run, tick, startedAt: started.at, update };
}

type Update = ReturnType<typeof useUpdate>;

/**
 * What the update writes: Select All, then the house type table with a tick on each type. Only the
 * types the newer Luma changed are listed (rule 7); no line says the SC's own edits are kept (rule 6).
 */
function UpdateBody({ u }: { u: Update }): React.ReactElement {
    return (
        <div className="clear-demo-body">
            {/* One block, so the body's gap does not stand between Select All and the boxes it ticks. */}
            <div>
                <SelectAllRow all={u.all} some={u.ticked.size > 0} onToggle={u.toggleAll} />
                <TypeTable rows={updateRows(u.changes)} label="What the update writes, by type" picks={{ ticked: u.ticked, onToggle: u.toggle }} />
            </div>
        </div>
    );
}

/** The check's wait, then the summary in the same window: it opens at the summary's size (rule 12). */
function SummaryWindow({ u, onClose }: { u: Update; onClose: () => void }): React.ReactElement {
    const checking = u.phase === 'check';
    return (
        <StepsWindow
            key="summary"
            title={TITLE}
            ready={!checking}
            waiting={checking ? WAIT_STAGES.checkingForChanges : false}
            closeLabel="Cancel"
            startButtons={[reviewButton(() => u.setPhase('records'))]}
            actionButtons={[{ label: 'Update', variant: 'accent', onPress: u.update, isDisabled: u.ticked.size === 0 }]}
            onClose={onClose}
        >
            <UpdateBody u={u} />
        </StepsWindow>
    );
}

/** The window for the phase, inside the job's one dialog container. */
function phaseWindow(u: Update, onClose: () => void): React.ReactElement {
    if (u.phase === 'run') return <RunWindow run={u.run} tick={u.tick} startedAt={u.startedAt} onClose={onClose} />;
    if (u.phase === 'records') {
        // Opens at Products, the largest type, as Install's opens.
        return <RecordsStep title={TITLE} rows={updateRows(u.changes)} first="Products" spread="data" firstTab="Changed" onBack={() => u.setPhase('form')} onClose={onClose} />;
    }
    return <SummaryWindow u={u} onClose={onClose} />;
}

export interface UpdateWindowProps {
    start: UpdateStart;
    /** The changed types not yet applied, by code, as the check would find them. */
    left: readonly string[];
    onClose: () => void;
    /** The chosen types are in Commerce now. */
    onUpdated: (codes: string[]) => void;
    /** The check found nothing left to apply. */
    onUpToDate: () => void;
}

export function UpdateWindow({ start, left, onClose, onUpdated, onUpToDate }: UpdateWindowProps): React.ReactElement {
    const u = useUpdate(start, left, onUpdated);
    useEffect(() => {
        if (u.phase === 'up-to-date') onUpToDate();
    }, [u.phase]); // eslint-disable-line react-hooks/exhaustive-deps
    if (u.phase === 'up-to-date') return <ResultDialog isOpen title={`${LUMA_PACK} Is Up to Date`} status="success" onClose={onClose} />;
    if (u.phase === 'updated') return <ResultDialog isOpen title={u.run.done} status="success" onClose={onClose} />;
    return <DialogContainer onDismiss={onClose}>{phaseWindow(u, onClose)}</DialogContainer>;
}
