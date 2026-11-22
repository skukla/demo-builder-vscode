/**
 * J2's part of the screen behind the windows: the datapack cards and their flyout, which datapack the
 * demo uses, and the install window open now. The Screen routes a J2 step here, so J1's windows and
 * J2's never share state. The panel's "Demo uses" and "Commerce holds" selects are the source of
 * truth for both: a step sets them, a tour stop sets them, and the owner can.
 */

import React, { useEffect, useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { InstallWindow, demoForStep, setupFor, setupForStep, type InstallSetup, type J2Window } from './j2-windows';
import type { TourStop } from './j1Tour';
import type { DemoUses, PackName } from './scenarioInstall';

/** Sets one of the panel's selects, as a person would, so everything reading it hears the change. */
export function setSelect(id: string, value: string): void {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select || select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

export interface J2Screen {
    /** Open a J2 review step's window, over the datapack the step says the demo uses. */
    openStep: (w: J2Window) => void;
    /** Back to the bare screen: no window, no flyout. */
    reset: () => void;
    /** A tour starts: the run ends clean and the Dry Run passes, whatever the panel was left at. */
    tourDefaults: () => void;
    /** A tour stop began: set what it says the demo uses and Commerce holds. */
    onTourStop: (stop: TourStop) => void;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** Which datapack the demo uses: the panel's "Demo uses" select, followed as it changes. */
export function useDemo(): [DemoUses, (demo: DemoUses) => void] {
    const [demo, setDemo] = useState<DemoUses>(() => window.__J1__.demo());
    useEffect(() => {
        const select = document.getElementById('j2-demo');
        const follow = (): void => setDemo(window.__J1__.demo());
        select?.addEventListener('change', follow);
        return () => select?.removeEventListener('change', follow);
    }, []);
    return [demo, (next) => setSelect('j2-demo', next)];
}

/** J2's screen state. `run` redraws the open window when a panel select changes. */
export function useJ2Screen(run: number): J2Screen {
    const [demo, setDemo] = useDemo();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [setup, setSetup] = useState<InstallSetup | null>(null);
    const [opened, setOpened] = useState(0);
    const open = (next: InstallSetup): void => {
        setOpened((n) => n + 1);
        setSetup(next);
    };
    // Install closes the flyout: the window it opens takes over.
    const install = (pack: PackName): void => {
        setFlyout(null);
        open(setupFor(pack, demo, window.__J1__.commerce()));
    };
    return {
        openStep: (w) => {
            setDemo(demoForStep(w));
            open(setupForStep(w, window.__J1__.commerce()));
        },
        reset: () => {
            setSetup(null);
            setFlyout(null);
        },
        tourDefaults: () => {
            setSelect('j2-ending', 'clean');
            setSelect('j2-dry', 'passed');
        },
        onTourStop: (stop) => {
            if (stop.demo) setDemo(stop.demo);
            if (stop.commerce) setSelect('j2-commerce', stop.commerce);
        },
        cards: (
            <>
                <DatapackCards demo={demo} onOpen={setFlyout} />
                <DatapackFlyout pack={flyout} demo={demo} onClose={() => setFlyout(null)} onInstall={install} />
            </>
        ),
        window: setup ? <InstallWindow key={`${opened}-${run}`} setup={setup} onClose={() => setSetup(null)} onInstalled={setDemo} /> : null,
    };
}
