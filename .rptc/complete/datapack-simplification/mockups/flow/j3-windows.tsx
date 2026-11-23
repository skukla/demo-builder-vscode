/**
 * J3 prototype: saving, creating and undoing, as overview.md Phase 2 (Undo Last Save) and Phase 7b
 * (Save, Save As New, Create Datapack) settle them and as prototype-conventions.md requires. Each job
 * is a sequence of windows, each the size of what it shows (rules 12 to 14), as J2's install is:
 *
 *   Save Changes:  the summary (what My Luma will hold; Review Records opens the spot check)
 *   Save As New:   the name, in the house form (one field, so the form's own size)
 *   Create:        the name and the picker together (both known at once, so the window never grows)
 *   Undo:          the question, small
 *   → the run (its own window, J2's run view) → the small result that closes itself.
 *
 * Every run ends clean here: J2-2 and J2-4 already judged how a run with a problem ends, and the
 * plan has no words yet for a failed save, create or undo.
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { CreatePicker, NameField, SaveSummary, nameError } from './j3-parts';
import { RunBody, useTraceLast } from './j2-parts';
import { useRunTick } from './j2-windows';
import { RecordsStep, reviewButton } from './TypeSummary';
import { DEMO_PACK, PACKS } from './scenarioInstall';
import { OWN_PACKS, SAVE_DEMO, allPicked, createRun, saveRows, saveRun, typesEnd, typesRunSteps, undoEnd, undoSteps, type SaveVariant } from './scenarioSave';
import type { ImportStep } from '@/features/data-installer/importSteps';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

/** Which J3 job a window is: a save (of which kind), a create, or an undo. */
export type J3Job = { kind: 'save'; variant: SaveVariant } | { kind: 'create' } | { kind: 'undo' };

/** What is on screen. Each is its own window. */
type Phase = 'form' | 'records' | 'name' | 'run' | 'done';

/** The run's words: the -ing title, the done title. */
interface RunWords {
    running: string;
    done: string;
}

/** A job's run: its words, how long it is, and its steps at any tick. J4's Restore runs one too. */
export interface JobRun extends RunWords {
    last: number;
    steps: (tick: number) => ImportStep[];
}

/** The datapack a save writes into, and the one it reads from (the demo's). */
const savedPack = (variant: SaveVariant) => PACKS[SAVE_DEMO[variant]];

/**
 * The name field starts empty, as the product's does, except Save As New from someone else's
 * datapack, which starts "My Bodea" (owner, 2026-11-12: "if the user saves a new pack from an
 * existing pack, we start with a name that says My <Pack>").
 */
const startingName = (job: J3Job): string =>
    job.kind === 'save' && job.variant === 'as-new-other' ? `My ${SAVE_DEMO[job.variant]}` : '';

/** The run a job starts, once its form is answered: the name typed, and what was ticked. */
function jobRun(job: J3Job, name: string, picked: Record<string, string[]>): JobRun {
    if (job.kind === 'undo') return { running: `Restoring ${DEMO_PACK}`, done: 'Last Save Undone', last: undoEnd(), steps: undoSteps };
    if (job.kind === 'create') {
        const run = createRun(name, picked);
        return { running: `Creating ${name}`, done: `Created ${name}`, last: typesEnd(run), steps: (t) => typesRunSteps(run, t) };
    }
    const into = job.variant === 'save' ? DEMO_PACK : name;
    const run = saveRun(savedPack(job.variant), into);
    const done = job.variant === 'save' ? `Saved to ${DEMO_PACK}` : `Saved as ${name}`;
    return { running: `Saving ${into}`, done, last: typesEnd(run), steps: (t) => typesRunSteps(run, t) };
}

/** The run's window, held at its tallest state from the first frame (J2's run, `StepsWindow`'s reserve). */
export function RunWindow({ run, tick, startedAt, onClose }: { run: JobRun; tick: number; startedAt: number; onClose: () => void }): React.ReactElement {
    const reserve = [run.last - 2, run.last - 1].filter((t) => t >= 0).map((t) => <RunBody key={t} steps={run.steps(t)} startedAt={0} />);
    return (
        <StepsWindow key="run" title={run.running} reserve={reserve} closeLabel="Run in Background" onClose={onClose}>
            <RunBody steps={run.steps(tick)} startedAt={startedAt} />
        </StepsWindow>
    );
}

/** "Undo Last Save?": the question, small (Phase 2's words). Undo is the standard blue action: red is for deleting and removing only (conventions rule 20). */
function UndoQuestion({ onUndo, onClose }: { onUndo: () => void; onClose: () => void }): React.ReactElement {
    return (
        <Modal title="Undo Last Save?" status="warning" size="S" fitContent onClose={onClose} closeLabel="Cancel" actionButtons={[{ label: 'Undo', variant: 'accent', onPress: onUndo }]}>
            <LeadText sentences>{`Commerce goes back to ${DEMO_PACK} as it was before your last save. Anything you changed since is lost.`}</LeadText>
        </Modal>
    );
}

/** The job's state: the phase, the name and picks the form holds, the error shown, the run. */
function useJob(job: J3Job, onDone: (name: string) => void) {
    const [phase, setPhase] = useState<Phase>('form');
    const [name, setName] = useState(startingName(job));
    const [picked, setPicked] = useState<Record<string, string[]>>(allPicked);
    const [error, setError] = useState<string | undefined>();
    const [started, setStarted] = useState({ id: 0, at: Date.now() });
    const run = jobRun(job, name.trim(), picked);
    const tick = useRunTick(phase === 'run', run.last, started.id);
    const ended = phase === 'run' && tick >= run.last;
    useTraceLast(`${job.kind}: ${phase}`);
    useEffect(() => {
        if (!ended) return;
        onDone(name.trim());
        setPhase('done');
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    const start = (): void => {
        setStarted((s) => ({ id: s.id + 1, at: Date.now() }));
        setPhase('run');
    };
    // Save and Create check the name first: an error shows in the room kept under the field.
    const submit = (taken: readonly string[]): void => {
        const problem = nameError(name, taken);
        setError(problem);
        if (!problem) start();
    };
    const rename = (next: string): void => {
        setName(next);
        setError(undefined);
    };
    return { phase, setPhase, name, rename, picked, setPicked, error, run, tick, startedAt: started.at, start, submit };
}

export interface J3WindowProps {
    job: J3Job;
    onClose: () => void;
    /** The run ended: a create names the datapack the demo now uses. */
    onDone: (job: J3Job, name: string) => void;
}

type Job = ReturnType<typeof useJob>;

/** Save Changes's summary, or its spot check. */
function SaveWindows({ j, onClose }: { j: Job; onClose: () => void }): React.ReactElement {
    const title = `Save Changes to ${DEMO_PACK}`;
    const rows = saveRows(PACKS[DEMO_PACK]);
    if (j.phase === 'records') return <RecordsStep title={title} rows={rows} first="Products" spread="data" tabs={false} onBack={() => j.setPhase('form')} onClose={onClose} />;
    return (
        <StepsWindow key="summary" title={title} closeLabel="Cancel" startButtons={[reviewButton(() => j.setPhase('records'))]} actionButtons={[{ label: 'Save', variant: 'accent', onPress: j.start }]} onClose={onClose}>
            <SaveSummary rows={rows} />
        </StepsWindow>
    );
}

/**
 * Create Datapack in two windows (owner, 2026-11-12, J3-2: one window with a field over a picker was
 * "hard to know where to focus"). First what it holds, wide, all ticked, Cancel and Next; Next waits
 * until something is ticked. Then the name, small, Back, Cancel and Create: the commit sits with the
 * last input, as Clear Commerce Instance's last step and Save As New's form do.
 */
function CreateWindow({ j, onClose }: { j: Job; onClose: () => void }): React.ReactElement {
    if (j.phase === 'name') {
        return (
            <StepsWindow key="create-name" title="Create Datapack" closeLabel="Cancel" startButtons={[{ label: 'Back', variant: 'secondary', onPress: () => j.setPhase('form') }]}
                actionButtons={[{ label: 'Create', variant: 'accent', onPress: () => j.submit([]) }]} onClose={onClose}>
                <NameField name={j.name} onChange={j.rename} error={j.error} />
            </StepsWindow>
        );
    }
    const none = Object.values(j.picked).every((ids) => ids.length === 0);
    return (
        <StepsWindow key="create" title="Create Datapack" wide closeLabel="Cancel" actionButtons={[{ label: 'Next', variant: 'accent', isDisabled: none, onPress: () => j.setPhase('name') }]} onClose={onClose}>
            <CreatePicker picked={j.picked} onChange={j.setPicked} />
        </StepsWindow>
    );
}

/** The window for the phase, inside the job's one dialog container. */
function JobWindow({ job, j, onClose }: { job: J3Job; j: Job; onClose: () => void }): React.ReactElement {
    if (j.phase === 'run') return <RunWindow run={j.run} tick={j.tick} startedAt={j.startedAt} onClose={onClose} />;
    if (job.kind === 'undo') return <UndoQuestion onUndo={j.start} onClose={onClose} />;
    if (job.kind === 'create') return <CreateWindow j={j} onClose={onClose} />;
    return <SaveWindows j={j} onClose={onClose} />;
}

export function J3Window({ job, onClose, onDone }: J3WindowProps): React.ReactElement {
    const j = useJob(job, (name) => onDone(job, name));
    if (j.phase === 'done') return <ResultDialog isOpen title={j.run.done} status="success" onClose={onClose} />;
    // Save As New: the house form, one field, no line (Phase 7b's leads are struck: rules 5 and 6).
    if (job.kind === 'save' && job.variant !== 'save' && j.phase === 'form') {
        return (
            <FormDialog isOpen title="Save As New Datapack" submitLabel="Save" onSubmit={() => j.submit(OWN_PACKS)} onClose={onClose}>
                <NameField name={j.name} onChange={j.rename} error={j.error} />
            </FormDialog>
        );
    }
    return (
        <DialogContainer onDismiss={onClose}>
            <JobWindow job={job} j={j} onClose={onClose} />
        </DialogContainer>
    );
}
