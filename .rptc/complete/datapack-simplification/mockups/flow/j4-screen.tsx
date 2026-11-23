/**
 * J4's part of the screen behind the windows: the cards, with the amber dot on the datapack the demo
 * uses while its latest save is not in Commerce, the flyout whose main button reads Restore My Luma,
 * and the Restore window open now. The demo uses My Luma throughout. The panel's "Commerce (J4)"
 * select is the source of truth for what Commerce holds: a step sets it, a tour stop sets it, the
 * owner can, and a restore or a save that leaves Commerce matching the last save sets it back.
 */

import React, { useEffect, useRef, useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect, useDemo } from './j2-screen';
import { RestoreWindow, type RestoreStart } from './j4-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, type PackName } from './scenarioInstall';
import type { RestoreCommerce } from './scenarioSave';

/** J4's windows, as review steps name them. */
export type J4StepWindow = Extract<StepWindow, `restore${string}`>;

/** Each J4 step: what Commerce holds, and where its window starts (none: the screen only). */
const STEP_SETUP: Record<J4StepWindow, { commerce: RestoreCommerce; start?: RestoreStart }> = {
    'restore-dot': { commerce: 'newer' },
    'restore-same': { commerce: 'matches', start: 'check' },
    restore: { commerce: 'edits', start: 'check' },
    'restore-run': { commerce: 'newer', start: 'run' },
};

export const isJ4Window = (w: StepWindow): w is J4StepWindow => w in STEP_SETUP;

/** The amber dot's hover (Phase 5, Clarity 1.9). */
/** The dot's hover: the fact only (owner, 2026-11-12: the longer sentence was "too wordy, too noisy"). */
const NEWER = 'Newer save available';

const SELECT = 'j4-commerce';

/** What Commerce holds: the panel's "Commerce (J4)" select, followed as it changes. */
function useCommerce(): [RestoreCommerce, (next: RestoreCommerce) => void] {
    const [commerce, setCommerce] = useState<RestoreCommerce>(() => window.__J1__.restore());
    useEffect(() => {
        const select = document.getElementById(SELECT);
        const follow = (): void => setCommerce(window.__J1__.restore());
        select?.addEventListener('change', follow);
        return () => select?.removeEventListener('change', follow);
    }, []);
    return [commerce, (next) => setSelect(SELECT, next)];
}

export interface J4Screen {
    /** Open a J4 review step: the screen over My Luma, and the step's window if it has one. */
    openStep: (w: J4StepWindow) => void;
    /** Back to the bare screen: no window, no flyout. */
    reset: () => void;
    /** A tour stop began: set what it says the demo uses and Commerce holds. */
    onTourStop: (stop: TourStop) => void;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J4's screen state. `run` redraws the open window when a panel select changes. */
export function useJ4Screen(run: number): J4Screen {
    const [demo, setDemo] = useDemo();
    const [commerce, setCommerce] = useCommerce();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [start, setStart] = useState<RestoreStart | null>(null);
    // Read by the result's own close, so a ref: no render stands between the run ending and it.
    const settled = useRef(false);
    const [opened, setOpened] = useState(0);
    const open = (next: RestoreStart): void => {
        setFlyout(null);
        settled.current = false;
        setOpened((n) => n + 1);
        setStart(next);
    };
    // Commerce follows only once the window is gone: setting the select redraws an open window.
    const close = (): void => {
        setStart(null);
        if (settled.current) setCommerce('matches');
    };
    return {
        openStep: (w) => {
            setDemo(DEMO_PACK);
            setCommerce(STEP_SETUP[w].commerce);
            const at = STEP_SETUP[w].start;
            if (at) open(at);
        },
        reset: () => {
            setStart(null);
            setFlyout(null);
        },
        onTourStop: (stop) => {
            if (stop.demo) setDemo(stop.demo);
            if (stop.restore) setCommerce(stop.restore);
        },
        cards: (
            <>
                <DatapackCards demo={demo} onOpen={setFlyout} {...(commerce === 'newer' ? { newer: NEWER } : {})} />
                <DatapackFlyout pack={flyout} demo={demo} onClose={() => setFlyout(null)} onRestore={() => open('check')} />
            </>
        ),
        window: start ? <RestoreWindow key={`${opened}-${run}`} start={start} commerce={commerce} onClose={close} onSettled={() => (settled.current = true)} /> : null,
    };
}
