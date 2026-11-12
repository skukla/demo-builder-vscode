/**
 * J5 prototype: Uninstall My Luma, from the More menu of the datapack the demo uses, as overview.md
 * Phase 4 settles it (one run window, drawn as steps; a run sent to the background) and Phase 3 (never
 * lose changes without asking), mirroring J2's Replace so the same job looks the same:
 *
 *   the check (J2's check window and wait)
 *   → "Uninstall My Luma?": what My Luma installed, J2's type table (Replace's question shape)
 *   → with unsaved changes: J2's "Save Your Changes First?", its verb Uninstall
 *   → the run (Install's run window): Save Your Changes when saving first, then Uninstall My Luma
 *       → clean: the small result, which closes itself (rule 17)
 *       → failed: the steps stay, the problem on its row, Retry (J2's stopped run)
 *   Run in Background stands where Cancel was while it runs: the window closes, the job goes on, and
 *   its end shows as a VS Code notification (the prototype's stand-in), in the result's own words.
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { InstallSummary, NotificationStandIn, RunBody, useTraceLast } from './j2-parts';
import { SaveFirstWindow, useRunTick } from './j2-windows';
import { DEMO_PACK, PACKS, type CommerceState, type PackName } from './scenarioInstall';
import { uninstallEnd, uninstallSteps, type UninstallEnding, type UninstallPlan } from './scenarioUninstall';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** Where an Uninstall window starts: the check (J5-1), or the run (J5-2 to J5-4). */
export type UninstallStart = 'check' | 'run';

/** What is on screen. Each is its own window; `run` also covers a run sent to the background. */
type Phase = 'check' | 'question' | 'save-first' | 'run' | 'uninstalled';

/** How long the success notification shows before it goes by itself (J5-3). */
const NOTIFICATION_SHOWN_MS = 5000;

/** The run's words: the -ing title, the in-window results; a notification uses the result's own words (rule 21). */
const wordsOf = (pack: PackName) => ({
    running: `Uninstalling ${pack}`,
    done: `${pack} Uninstalled`,
    failed: `Couldn't Uninstall ${pack}`,
    notified: `${pack} Uninstalled`,
});

/** The job's state: the phase, the run, and whether it was sent to the background. */
function useUninstall(pack: PackName, start: UninstallStart, commerce: CommerceState, ending: UninstallEnding, onUninstalled: () => void) {
    const [phase, setPhase] = useState<Phase>(start);
    const [plan, setPlan] = useState<UninstallPlan>({ saves: start === 'run' && commerce === 'unsaved', ending });
    const [started, setStarted] = useState({ id: 0, at: Date.now() });
    const [background, setBackground] = useState(false);
    const last = uninstallEnd(plan);
    const tick = useRunTick(phase === 'run', last, started.id);
    const ended = phase === 'run' && tick >= last;
    useTraceLast(`Uninstall: ${phase}`);
    const run = (saves: boolean, next: UninstallEnding = plan.ending): void => {
        setPlan({ saves, ending: next });
        setStarted((s) => ({ id: s.id + 1, at: Date.now() }));
        setPhase('run');
    };
    // After the check: the question. Its Uninstall asks to save first only when there is something to save.
    useEffect(() => {
        if (phase !== 'check') return undefined;
        const t = setTimeout(() => setPhase('question'), window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [phase]);
    useEffect(() => {
        if (!ended || plan.ending === 'fails') return;
        onUninstalled();
        if (!background) setPhase('uninstalled');
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    const confirm = (): void => (commerce === 'unsaved' ? setPhase('save-first') : run(false));
    return { pack, words: wordsOf(pack), phase, plan, tick, ended, startedAt: started.at, background, sendToBackground: () => setBackground(true), run, confirm };
}

type Job = ReturnType<typeof useUninstall>;

/** The check, then "Uninstall My Luma?" over what My Luma installed: J2's Replace question, Uninstall in red (rule 20). */
function QuestionWindow({ j, onClose }: { j: Job; onClose: () => void }): React.ReactElement {
    const ready = j.phase !== 'check';
    return (
        <StepsWindow key="question" title={ready ? `Uninstall ${j.pack}?` : `Uninstall ${j.pack}`} {...(ready ? { status: 'warning' as const } : {})}
            ready={ready} waiting={ready ? false : WAIT_STAGES.checkingForChanges} closeLabel="Cancel"
            actionButtons={ready ? [{ label: 'Uninstall', variant: 'negative', onPress: j.confirm }] : []} onClose={onClose}>
            <InstallSummary pack={PACKS[j.pack]} />
        </StepsWindow>
    );
}

const runBody = (plan: UninstallPlan, tick: number, startedAt: number, pack: PackName): React.ReactElement => (
    <RunBody steps={uninstallSteps(plan, tick, pack)} startedAt={startedAt} {...(tick >= uninstallEnd(plan) ? { end: { lines: [] } } : {})} />
);

/** The run, held at its tallest state from the first frame: mid-way, and ended with a problem. */
function RunWindow({ j, onClose }: { j: Job; onClose: () => void }): React.ReactElement {
    const failed = j.ended && j.plan.ending === 'fails';
    const end = uninstallEnd(j.plan);
    const reserve = [runBody(j.plan, end - 1, 0, j.pack), runBody({ ...j.plan, ending: 'fails' }, end, 0, j.pack)];
    return (
        <StepsWindow key={`run-${j.plan.saves}`} title={failed ? j.words.failed : j.words.running} {...(failed ? { status: 'error' as const } : {})} reserve={reserve}
            closeLabel={failed ? 'Close' : 'Run in Background'} onClose={failed ? onClose : j.sendToBackground}
            actionButtons={failed ? [{ label: 'Retry', variant: 'accent', onPress: () => j.run(j.plan.saves, 'succeeds') }] : []}>
            {runBody(j.plan, j.tick, j.startedAt, j.pack)}
        </StepsWindow>
    );
}

/** A run sent to the background, once it ends: success goes quietly, a failure stays with one way in (Phase 4). */
function BackgroundEnd({ j, onClose }: { j: Job; onClose: () => void }): React.ReactElement | null {
    const failed = j.plan.ending === 'fails';
    useEffect(() => {
        if (!j.ended || failed) return undefined;
        const t = setTimeout(onClose, NOTIFICATION_SHOWN_MS);
        return () => clearTimeout(t);
    }, [j.ended, failed]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!j.ended) return null;
    if (!failed) return <NotificationStandIn message={j.words.notified} />;
    return <NotificationStandIn message={j.words.failed} button={{ label: 'Open Debug Logs', onPress: onClose }} />;
}

/** The window for the phase, inside the job's one dialog container. */
function phaseWindow(j: Job, onClose: () => void): React.ReactElement {
    if (j.phase === 'run') return <RunWindow j={j} onClose={onClose} />;
    if (j.phase === 'save-first') return <SaveFirstWindow verb="Uninstall" onRun={(saves) => j.run(saves)} onClose={onClose} />;
    return <QuestionWindow j={j} onClose={onClose} />;
}

export interface UninstallWindowProps {
    /** The datapack Uninstall was chosen on; My Luma unless said. */
    pack?: PackName;
    start: UninstallStart;
    /** What Commerce holds against My Luma, read when the window opened. */
    commerce: CommerceState;
    /** How the run ends, read when the window opened. */
    ending: UninstallEnding;
    onClose: () => void;
    /** The run ended with My Luma out of Commerce: its card loses the check. */
    onUninstalled: () => void;
}

export function UninstallWindow({ pack = DEMO_PACK, start, commerce, ending, onClose, onUninstalled }: UninstallWindowProps): React.ReactElement | null {
    const j = useUninstall(pack, start, commerce, ending, onUninstalled);
    if (j.background) return <BackgroundEnd j={j} onClose={onClose} />;
    if (j.phase === 'uninstalled') return <ResultDialog isOpen title={j.words.done} status="success" onClose={onClose} />;
    const dismiss = j.phase === 'run' && !j.ended ? j.sendToBackground : onClose;
    return (
        <DialogContainer onDismiss={dismiss}>
            {phaseWindow(j, onClose)}
        </DialogContainer>
    );
}
