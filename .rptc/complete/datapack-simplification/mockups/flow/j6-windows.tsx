/**
 * J6 prototype: retrying an install that failed, from the failed datapack's flyout, as overview.md
 * Phase 5 settles it and J2-4 approved the ending (a failed run offers Retry, then Fix with AI):
 *
 *   Retry → the install run (J2's run window, held at its tallest state)
 *       → it works: the small result "My Luma Installed", which closes itself (rule 17)
 *       → it stops again: the steps stay, the problem on its row, and the footer's one action is
 *         Retry while a retry can get past the stop, Fix with AI once retries have not helped
 *
 * The run's words are J2's: "Installing My Luma", "My Luma Installed", "Couldn't Install My Luma".
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { RunBody, useTraceLast } from './j2-parts';
import { endOf, fixWithAi, useRunTick } from './j2-windows';
import { DEMO_PACK, endTick, runSteps, type RunPlan } from './scenarioInstall';
import { canRetry, retryPlan, type RetryEnding } from './scenarioFailed';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

const WORDS = {
    running: `Installing ${DEMO_PACK}`,
    done: `${DEMO_PACK} Installed`,
    failed: `Couldn't Install ${DEMO_PACK}`,
};

const runBody = (plan: RunPlan, tick: number, startedAt: number): React.ReactElement => (
    <RunBody steps={runSteps(plan, tick)} startedAt={startedAt} {...(tick >= endTick(plan) ? { end: endOf() } : {})} />
);

/** The run's states, drawn hidden so its window opens at the tallest: mid-way, and stopped. */
function reserve(): React.ReactNode[] {
    const mid = retryPlan('succeeds');
    const stopped = retryPlan('fails');
    return [runBody(mid, endTick(mid) - 3, 0), runBody(mid, endTick(mid) - 2, 0), runBody(stopped, endTick(stopped), 0)];
}

export interface RetryWindowProps {
    /** Retries that had not helped when the window opened, the creation-time install not counted. */
    retries: number;
    /** Open on a run that has already stopped (J6-3), rather than a new one. */
    startEnded: boolean;
    /** A run stopped again: one more retry did not help. */
    onStopped: () => void;
    /** A run worked: My Luma is in Commerce. */
    onInstalled: () => void;
    onClose: () => void;
}

/**
 * The job: the run's plan and clock. A run is started on open unless the window opens on a stopped
 * one. `failures` counts the retries that did not help, this run included once it stops, so the
 * footer's action is right from the frame it appears in (a button's words never change on screen).
 */
function useRetry(retries: number, startEnded: boolean, onStopped: () => void, onInstalled: () => void) {
    const [run, setRun] = useState({ id: 0, ending: (startEnded ? 'fails' : window.__J1__.retryEnds()) as RetryEnding, at: Date.now(), before: retries });
    const [installed, setInstalled] = useState(false);
    const plan = retryPlan(run.ending);
    const last = endTick(plan);
    const held = startEnded && run.id === 0;
    const ticked = useRunTick(!held, last, run.id);
    const tick = held ? last : ticked;
    const ended = tick >= last;
    useTraceLast(installed ? 'Retry: installed' : 'Retry: run');
    useEffect(() => {
        if (!ended || held) return;
        if (run.ending === 'fails') onStopped();
        else {
            onInstalled();
            setInstalled(true);
        }
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    const again = (): void => setRun((r) => ({ id: r.id + 1, ending: window.__J1__.retryEnds(), at: Date.now(), before: r.before + 1 }));
    const failures = held ? run.before : run.before + 1;
    return { plan, tick, ended, installed, failures, startedAt: run.at, again };
}

export function RetryWindow({ retries, startEnded, onStopped, onInstalled, onClose }: RetryWindowProps): React.ReactElement {
    const r = useRetry(retries, startEnded, onStopped, onInstalled);
    if (r.installed) return <ResultDialog isOpen title={WORDS.done} status="success" onClose={onClose} />;
    const stopped = r.ended && r.plan.ending === 'stopped';
    const action: ActionButton = canRetry(r.failures) ? { label: 'Retry', variant: 'accent', onPress: r.again } : fixWithAi();
    return (
        <DialogContainer onDismiss={onClose}>
            <StepsWindow key="run" title={stopped ? WORDS.failed : WORDS.running} {...(stopped ? { status: 'error' as const } : {})} reserve={reserve()}
                closeLabel={stopped ? 'Close' : 'Run in Background'} actionButtons={stopped ? [action] : []} onClose={onClose}>
                {runBody(r.plan, r.tick, r.startedAt)}
            </StepsWindow>
        </DialogContainer>
    );
}
