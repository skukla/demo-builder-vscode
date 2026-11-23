/**
 * J2 prototype: installing a datapack the demo does not use, from its flyout's Install, as the plan
 * settles it (overview.md Phase 3, Phase 4, Phase 5, D6) and as prototype-conventions.md requires.
 * Each window is the size of what it shows (rules 12 to 14), so the job is a sequence of windows,
 * as J1's Clear is (its summary, then its run window):
 *
 *   the summary (the check's wait, then what installing adds; Review Records opens the spot check)
 *   → the run (its own window, held at its tallest state) → the small result that closes itself.
 *   A Dry Run's answer and "Save Your Changes First?" are their own small windows.
 *
 * Over the demo's own datapack with unsaved changes, Replace asks "Save Your Changes First?" AFTER
 * the Replace question: its buttons commit (Replace Without Saving, Save and Replace), as the Phase 3
 * mockup's do (Install Without Saving, Save and Install), so it is the last question before the run.
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { DryRunBody, InstallSummary, RunBody, SaveFirstBody, announceSaveTip, useTraceLast } from './j2-parts';
import { RecordsStep, reviewButton } from './TypeSummary';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, DRY_RUN, OTHER_PACK, PACKS, RUN_TOOK_MS, endTick, installRows, runSteps, type CommerceState, type DemoUses, type DryRunAnswer, type PackName, type RunEnding, type RunPlan } from './scenarioInstall';
import type { RunEnd } from '@/features/data-installer/ui/components/ImportRunView';
import type { ActionButton, ModalStatus, ModalWait } from '@/core/ui/components/ui/Modal';
import { ResultDialog, ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { tookValue } from '@/core/ui/hooks/useRunClock';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** Where an install window starts: the check, or straight at the step a review step shows. */
export type InstallStart = 'check' | 'run' | 'dry-result';

/** One install window: which datapack, the one it replaces, what Commerce holds, where it starts. */
export interface InstallSetup {
    pack: PackName;
    replaces?: PackName;
    commerce: CommerceState;
    start: InstallStart;
}

/** J2's windows, as review steps name them. */
export type J2Window = Extract<StepWindow, `install-${string}` | 'replace' | 'dry-run'>;

/** Each J2 window as its review step opens it: which datapack the demo uses, and where it starts. */
const STEP_SETUP: Record<J2Window, { demo: DemoUses; start: InstallStart }> = {
    'install-changes': { demo: 'none', start: 'check' },
    'install-run': { demo: 'none', start: 'run' },
    replace: { demo: DEMO_PACK, start: 'check' },
    'dry-run': { demo: 'none', start: 'dry-result' },
};

export const isJ2Window = (w: StepWindow): w is J2Window => w in STEP_SETUP;
/** Which datapack the demo uses at a J2 step. */
export const demoForStep = (w: J2Window): DemoUses => STEP_SETUP[w].demo;

/** Install on a datapack's flyout: a first install, or a replace of the one the demo uses. */
export function setupFor(pack: PackName, demo: DemoUses, commerce: CommerceState, start: InstallStart = 'check'): InstallSetup {
    return { pack, ...(demo === 'none' || demo === pack ? {} : { replaces: demo }), commerce, start };
}

/** A J2 step's window: Bodea, over what the step says the demo uses. */
export const setupForStep = (w: J2Window, commerce: CommerceState): InstallSetup => setupFor(OTHER_PACK, STEP_SETUP[w].demo, commerce, STEP_SETUP[w].start);

/** What is on screen. Each group is its own window: summary, records, dry, save, run, installed. */
type Phase = 'check' | 'form' | 'dry-wait' | 'records' | 'dry-result' | 'save-first' | 'run' | 'installed';

/** How long each unit of the run takes in the prototype: long enough to watch, short enough not to wait. */

/** Everything a window's frame and body read. */
interface Ctx {
    setup: InstallSetup;
    plan: RunPlan;
    tick: number;
    ended: boolean;
    answer: DryRunAnswer;
    startedAt: number;
    go: (phase: Phase) => void;
    run: (saves: boolean, ending?: RunEnding) => void;
    dryRun: (answer?: DryRunAnswer) => void;
    close: () => void;
}

/** A window's title, status, way out and buttons. */
interface Frame {
    title: string;
    status?: ModalStatus;
    closeLabel?: string;
    waiting?: ModalWait;
    startButtons?: ActionButton[];
    actionButtons?: ActionButton[];
}

export const fixWithAi = (): ActionButton => ({ label: 'Fix with AI', variant: 'accent', onPress: () => undefined, hint: 'Opens your AI assistant on this problem' });

/** The summary's frame: Install's or Replace's question; the check and a Dry Run wait in it. */
function summaryFrame(c: Ctx, phase: Phase): Frame {
    const { pack, replaces } = c.setup;
    const title = replaces ? `Switch to ${pack}?` : `Install ${pack}`;
    if (phase === 'check') return { title: replaces ? `Switch to ${pack}` : `Install ${pack}`, closeLabel: 'Cancel', waiting: replaces ? WAIT_STAGES.checkingForChanges : WAIT_STAGES.readingWhatToSelect };
    if (phase === 'dry-wait') return { title, closeLabel: 'Cancel', waiting: WAIT_STAGES.checkingImport };
    const review = [reviewButton(() => c.go('records'))];
    if (replaces) {
        const onPress = (): void => (c.setup.commerce === 'unsaved' ? c.go('save-first') : c.run(false));
        return { title, status: 'warning', closeLabel: 'Cancel', startButtons: review, actionButtons: [{ label: 'Switch', variant: 'accent', onPress }] };
    }
    return {
        title,
        closeLabel: 'Cancel',
        startButtons: review,
        actionButtons: [
            { label: 'Dry Run', variant: 'secondary', onPress: () => c.dryRun() },
            { label: 'Install', variant: 'accent', onPress: () => c.run(false) },
        ],
    };
}

/** The run's frame: the -ing title while it runs; once it ends with a problem, the outcome and its one action. */
function runFrame(c: Ctx): Frame {
    const { pack, replaces } = c.setup;
    if (!c.ended) return { title: replaces ? `Switching to ${pack}` : `Installing ${pack}`, closeLabel: 'Run in Background' };
    if (c.plan.ending === 'stopped') {
        return { title: `Couldn't Install ${pack}`, status: 'error', actionButtons: [{ label: 'Retry', variant: 'accent', onPress: () => c.run(c.plan.saves, 'clean') }] };
    }
    return { title: `${pack} Installed`, status: 'warning', actionButtons: [fixWithAi()] };
}

/** The end under a run with a problem: "Took …" only, for a run of a minute or more (Phase 4). */
export const endOf = (): RunEnd => {
    const took = tookValue(RUN_TOOK_MS);
    return { lines: [], ...(took ? { took } : {}) };
};

const runBody = (p: RunPlan, tick: number, startedAt: number): React.ReactElement => (
    <RunBody steps={runSteps(p, tick)} startedAt={startedAt} {...(tick >= endTick(p) ? { end: endOf() } : {})} />
);

/** The run's states, drawn hidden so its window opens at the tallest: mid-way, and each ending with a problem. */
function runReserve(c: Ctx): React.ReactNode[] {
    const plan = (ending: RunEnding): RunPlan => ({ ...c.plan, ending });
    const mid = plan('clean');
    return [runBody(mid, endTick(mid) - 3, 0), runBody(mid, endTick(mid) - 2, 0), runBody(plan('warning'), endTick(plan('warning')), 0), runBody(plan('stopped'), endTick(plan('stopped')), 0)];
}

/** The summary window: the check's wait, then what installing adds (Replace asks over the same table). */
function SummaryWindow({ c, phase }: { c: Ctx; phase: Phase }): React.ReactElement {
    const frame = summaryFrame(c, phase);
    const pack = PACKS[c.setup.pack];
    return (
        <StepsWindow key="summary" title={frame.title} {...(frame.status ? { status: frame.status } : {})} ready={phase !== 'check'} waiting={frame.waiting ?? false}
            closeLabel={frame.closeLabel ?? 'Close'} startButtons={frame.startButtons ?? []} actionButtons={frame.actionButtons ?? []} onClose={c.close}>
            <InstallSummary pack={pack} />
        </StepsWindow>
    );
}

/** A Dry Run's answer, its own small window (rules 12, 14), with the install's ending buttons (Phase 4). Back returns to the summary. */
function DryWindow({ c }: { c: Ctx }): React.ReactElement {
    const { title, status } = DRY_RUN[c.answer];
    const main: Record<DryRunAnswer, ActionButton> = {
        passed: { label: 'Install', variant: 'accent', onPress: () => c.run(false) },
        problem: fixWithAi(),
        failed: { label: 'Retry', variant: 'accent', onPress: () => c.dryRun('passed') },
    };
    return (
        <ResultWindow key="dry" title={title} status={status} actionButtons={[{ label: 'Back', variant: 'secondary', onPress: () => c.go('form') }, main[c.answer]]} onClose={c.close}>
            <DryRunBody answer={c.answer} pack={c.setup.pack} />
        </ResultWindow>
    );
}

/**
 * "Save Your Changes First?", its own window sized to what it shows (rule 14). The Steps layout's
 * large width, as today's confirm takes, so the three buttons sit on one line: at medium the main
 * button fell to a second line (walk F127, rejected).
 */
function SaveWindow({ c }: { c: Ctx }): React.ReactElement {
    return <SaveFirstWindow verb="Switch" onRun={c.run} onClose={c.close} />;
}

export interface SaveFirstWindowProps {
    /** The job's verb on both commit buttons: Switch (J2), Uninstall (J5), Reset or Delete (J7). */
    verb: string;
    /** Start the job, saving first or not. */
    onRun: (saves: boolean) => void;
    onClose: () => void;
    /** What is saved, when it is not one datapack's changes by type (J7: one row per datapack). */
    body?: React.ReactNode;
    /** Save and <verb> waits, as while a new datapack's name is refused (J7). */
    saveDisabled?: boolean;
}

/** "Save Your Changes First?" for any job that loses changes: the losing choice outline (rule 20). */
export function SaveFirstWindow({ verb, onRun, onClose, body, saveDisabled }: SaveFirstWindowProps): React.ReactElement {
    const answer = (saves: boolean): void => {
        announceSaveTip();
        onRun(saves);
    };
    return (
        <StepsWindow
            key="save"
            title="Save Your Changes First?"
            status="warning"
            hideClose
            startButtons={[{ label: `${verb} Without Saving`, variant: 'secondary', onPress: () => answer(false) }]}
            actionButtons={[
                { label: 'Cancel', variant: 'secondary', onPress: onClose },
                { label: `Save and ${verb}`, variant: 'accent', onPress: () => answer(true), isDisabled: saveDisabled === true },
            ]}
            onClose={onClose}
        >
            {body ?? <SaveFirstBody />}
        </StepsWindow>
    );
}

function RunWindow({ c }: { c: Ctx }): React.ReactElement {
    const frame = runFrame(c);
    return (
        <StepsWindow key={`run-${c.plan.saves}`} title={frame.title} {...(frame.status ? { status: frame.status } : {})} reserve={runReserve(c)}
            closeLabel={frame.closeLabel ?? 'Close'} actionButtons={frame.actionButtons ?? []} onClose={c.close}>
            {runBody(c.plan, c.tick, c.startedAt)}
        </StepsWindow>
    );
}

/** The window for the phase, inside the job's one dialog container. */
function JobWindow({ c, phase }: { c: Ctx; phase: Phase }): React.ReactElement {
    if (phase === 'records') {
        // Opens at Products, the largest type, as J1's opens at its first and largest.
        return <RecordsStep title={summaryFrame(c, 'form').title} rows={installRows(PACKS[c.setup.pack])} first="Products" spread="data" tabs={false} onBack={() => c.go('form')} onClose={c.close} />;
    }
    if (phase === 'dry-result') return <DryWindow c={c} />;
    if (phase === 'run') return <RunWindow c={c} />;
    return <SummaryWindow c={c} phase={phase} />;
}

/** The run's clock: one tick per unit of work until it ends. */
export function useRunTick(running: boolean, last: number, runId: number): number {
    const [tick, setTick] = useState({ runId, at: 0 });
    const at = tick.runId === runId ? tick.at : 0;
    useEffect(() => {
        if (!running || at >= last) return undefined;
        const t = setTimeout(() => setTick({ runId, at: at + 1 }), window.__J1__.paceMs());
        return () => clearTimeout(t);
    }, [running, at, last, runId]);
    return at;
}

export interface InstallWindowProps {
    setup: InstallSetup;
    onClose: () => void;
    /** The run ended with the datapack in Commerce: the card's check moves to it. */
    onInstalled: (pack: PackName) => void;
}

/** The job's state: the phase, the run, the Dry Run's answer. */
function useInstallFlow(setup: InstallSetup, onInstalled: (pack: PackName) => void, close: () => void) {
    const pack = PACKS[setup.pack];
    const [phase, setPhase] = useState<Phase>(setup.start);
    const [run, setRun] = useState({ id: 0, saves: false, ending: window.__J1__.ending(), startedAt: Date.now() });
    const [answer, setAnswer] = useState<DryRunAnswer>(window.__J1__.dryRun());
    const plan: RunPlan = { pack, ...(setup.replaces ? { replaces: setup.replaces } : {}), saves: run.saves, ending: run.ending };
    const tick = useRunTick(phase === 'run', endTick(plan), run.id);
    const ended = phase === 'run' && tick >= endTick(plan);
    useTraceLast(`Install: ${phase}`);
    useTimedStep(phase, 'check', 'form', setPhase);
    useTimedStep(phase, 'dry-wait', 'dry-result', setPhase);
    useRunEnd(ended, plan, setPhase, onInstalled);
    const c: Ctx = {
        setup, plan, tick, ended, answer, close,
        startedAt: run.startedAt,
        go: setPhase,
        run: (saves, ending = run.ending) => {
            setRun((r) => ({ id: r.id + 1, saves, ending, startedAt: Date.now() }));
            setPhase('run');
        },
        dryRun: (next) => {
            if (next) setAnswer(next);
            setPhase('dry-wait');
        },
    };
    return { phase, c };
}

export function InstallWindow({ setup, onClose, onInstalled }: InstallWindowProps): React.ReactElement {
    const { phase, c } = useInstallFlow(setup, onInstalled, onClose);
    if (phase === 'installed') return <ResultDialog isOpen title={`${setup.pack} Installed`} status="success" onClose={onClose} />;
    return (
        <DialogContainer onDismiss={onClose}>
            {phase === 'save-first' ? <SaveWindow c={c} /> : <JobWindow c={c} phase={phase} />}
        </DialogContainer>
    );
}

/** A wait that ends on its own: the check before the summary, a Dry Run before its answer. */
function useTimedStep(phase: Phase, from: Phase, to: Phase, setPhase: (p: Phase) => void): void {
    useEffect(() => {
        if (phase !== from) return undefined;
        const t = setTimeout(() => setPhase(to), window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [phase, from, to, setPhase]);
}

/** A run that ended: clean hands off to the small result; the datapack is in Commerce unless it stopped. */
function useRunEnd(ended: boolean, plan: RunPlan, setPhase: (p: Phase) => void, onInstalled: (pack: PackName) => void): void {
    const { ending } = plan;
    const name = plan.pack.name;
    useEffect(() => {
        if (!ended) return;
        if (ending !== 'stopped') onInstalled(name);
        if (ending === 'clean') setPhase('installed');
    }, [ended, ending, name, setPhase, onInstalled]);
}
