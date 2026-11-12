/**
 * J4 prototype: Restore My Luma, on the datapack the demo uses, as overview.md Phase 5 (the Restore
 * question and its label) and Phase 3 (nothing to do ends at the check) settle it and as
 * prototype-conventions.md requires. Each window is the size of what it shows (rules 12 to 14):
 *
 *   the check (J2's check window and wait)
 *   → Commerce matches the last save: "My Luma Is Up to Date", which closes itself (rule 17)
 *   → unsaved edits: "Restore My Luma?", small, as J3's Undo question is
 *   → a newer save only: straight to the run (nothing of the SC's is lost)
 *       → Restore: the run (Undo Last Save's steps, J3's run window) → the small result
 *
 * Every run ends clean here, as J3's do: J2-2 already judged how a run with a problem ends.
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { useTraceLast } from './j2-parts';
import { useRunTick } from './j2-windows';
import { RunWindow, type JobRun } from './j3-windows';
import { DEMO_PACK, PACKS, endTick, runSteps, type PackName, type RunPlan } from './scenarioInstall';
import type { RestoreCommerce } from './scenarioSave';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** Where a Restore window starts: the check (J4-2, J4-3), or the run (J4-4). */
export type RestoreStart = 'check' | 'run';

/** What is on screen. Each is its own window. */
type Phase = 'check' | 'question' | 'run' | 'restored' | 'up-to-date';

/**
 * The run: Undo Last Save's (Uninstall My Luma, Install My Luma, Verify Installation) under the
 * plan's label "Restoring My Luma". The plan names no done title; "My Luma Restored" is the
 * prototype's, in the form of "Bodea Installed".
 */
function restoreRun(pack: PackName): JobRun {
    const plan: RunPlan = { pack: PACKS[pack], replaces: pack, saves: false, ending: 'clean' };
    return { running: `Restoring ${pack}`, done: `${pack} Restored`, last: endTick(plan), steps: (tick) => runSteps(plan, tick) };
}

/** The check before anything: J2's check window and its wait, under the button's own words. */
function CheckWindow({ pack, onClose }: { pack: PackName; onClose: () => void }): React.ReactElement {
    return <StepsWindow key="check" title={`Restore ${pack}`} waiting={WAIT_STAGES.checkingForChanges} closeLabel="Cancel" onClose={onClose} />;
}

interface QuestionProps {
    pack: PackName;
    onRestore: () => void;
    onClose: () => void;
}

/**
 * "Restore My Luma?": Phase 5's words, in J3's Undo question's shape. Restore is the standard blue:
 * red is for deleting and removing only (rule 20). No Save Changes First (owner, 2026-11-12): once
 * saved, Commerce matches the last save and the restore has nothing to do. Small, as Undo's is.
 */
function RestoreQuestion({ pack, onRestore, onClose }: QuestionProps): React.ReactElement {
    return (
        <Modal
            title={`Restore ${pack}?`}
            status="warning"
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[{ label: 'Restore', variant: 'accent', onPress: onRestore }]}
        >
            <LeadText sentences>{`Commerce goes back to ${pack} as you last saved it. Anything you changed since is lost.`}</LeadText>
        </Modal>
    );
}

/** The job's state: the phase, the run's clock, the check's wait. `onSettled` once Commerce matches the last save. */
function useRestore(pack: PackName, start: RestoreStart, commerce: RestoreCommerce, onSettled: () => void) {
    const run = restoreRun(pack);
    const [phase, setPhase] = useState<Phase>(start);
    const [started, setStarted] = useState({ id: 0, at: Date.now() });
    const tick = useRunTick(phase === 'run', run.last, started.id);
    const ended = phase === 'run' && tick >= run.last;
    useTraceLast(`Restore: ${phase}`);
    const restore = (): void => {
        setStarted((s) => ({ id: s.id + 1, at: Date.now() }));
        setPhase('run');
    };
    // After the check: nothing to change ends there; unsaved edits ask first; a newer save alone
    // runs straight away, as nothing of the SC's is lost (owner, 2026-11-12).
    useEffect(() => {
        if (phase !== 'check') return undefined;
        const t = setTimeout(() => {
            if (commerce === 'matches') setPhase('up-to-date');
            else if (commerce === 'edits') setPhase('question');
            else restore();
        }, window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [phase, commerce]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!ended) return;
        onSettled();
        setPhase('restored');
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    return { pack, run, phase, setPhase, tick, startedAt: started.at, restore };
}

type Restore = ReturnType<typeof useRestore>;

/** The window for the check, the question or the run, inside the job's one dialog container. */
function phaseWindow(r: Restore, onClose: () => void): React.ReactElement {
    if (r.phase === 'run') return <RunWindow run={r.run} tick={r.tick} startedAt={r.startedAt} onClose={onClose} />;
    if (r.phase === 'question') return <RestoreQuestion pack={r.pack} onRestore={r.restore} onClose={onClose} />;
    return <CheckWindow pack={r.pack} onClose={onClose} />;
}

export interface RestoreWindowProps {
    /** The datapack the flyout's Restore was pressed on; My Luma unless said. */
    pack?: PackName;
    start: RestoreStart;
    /** What Commerce holds, read when the window opened. */
    commerce: RestoreCommerce;
    onClose: () => void;
    /** Commerce now matches the last save: the restore ran. */
    onSettled: () => void;
}

export function RestoreWindow({ pack = DEMO_PACK, start, commerce, onClose, onSettled }: RestoreWindowProps): React.ReactElement {
    const r = useRestore(pack, start, commerce, onSettled);
    if (r.phase === 'up-to-date') return <ResultDialog isOpen title={`${r.pack} Is Up to Date`} status="success" onClose={onClose} />;
    if (r.phase === 'restored') return <ResultDialog isOpen title={r.run.done} status="success" onClose={onClose} />;
    return (
        <DialogContainer onDismiss={onClose}>
            {phaseWindow(r, onClose)}
        </DialogContainer>
    );
}
