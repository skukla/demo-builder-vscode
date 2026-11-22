/**
 * J5's part of the screen behind the windows: the cards, the flyout of the datapack the demo uses with
 * Uninstall in its More menu (where the product reaches it: `PackActions.tsx`'s lower section, which
 * J8-3 judges), and the Uninstall job open now, in its window or in the background. The panel's
 * "Demo uses", "Commerce holds" and "Uninstall ends (J5)" selects are the source of truth, as in J2.
 */

import { Item } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect, useDemo } from './j2-screen';
import { UninstallWindow, type UninstallStart } from './j5-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, type PackName } from './scenarioInstall';
import type { UninstallEnding } from './scenarioUninstall';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';

/** J5's windows, as review steps name them. */
export type J5StepWindow = Extract<StepWindow, 'uninstall' | 'uninstall-run' | `background-${string}`>;

/** Each J5 step: where its window starts, and how the run ends (absent: the panel's choice). */
const STEP_SETUP: Record<J5StepWindow, { start: UninstallStart; ending?: UninstallEnding }> = {
    uninstall: { start: 'check' },
    'uninstall-run': { start: 'run' },
    'background-success': { start: 'run', ending: 'succeeds' },
    'background-failure': { start: 'run', ending: 'fails' },
};

export const isJ5Window = (w: StepWindow): w is J5StepWindow => w in STEP_SETUP;

const ENDS_SELECT = 'j5-ends';

export interface J5Screen {
    /** Open a J5 review step: the screen over My Luma, and the step's window. */
    openStep: (w: J5StepWindow) => void;
    /** Back to the bare screen: no window, no flyout. */
    reset: () => void;
    /** A tour stop began: set what it says the demo uses, Commerce holds and the run does. */
    onTourStop: (stop: TourStop) => void;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J5's screen state. `run` redraws the open window when a panel select changes. */
export function useJ5Screen(run: number): J5Screen {
    const [demo, setDemo] = useDemo();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [start, setStart] = useState<UninstallStart | null>(null);
    const [opened, setOpened] = useState(0);
    const open = (next: UninstallStart): void => {
        setFlyout(null);
        setOpened((n) => n + 1);
        setStart(next);
    };
    const more = (
        <CardActionsMenu label="More" ariaLabel={`More actions for ${DEMO_PACK}`} onAction={() => open('check')}>
            <Item key="uninstall">Uninstall</Item>
        </CardActionsMenu>
    );
    return {
        openStep: (w) => {
            setDemo(DEMO_PACK);
            const { start: at, ending } = STEP_SETUP[w];
            if (ending) setSelect(ENDS_SELECT, ending);
            open(at);
        },
        reset: () => {
            setStart(null);
            setFlyout(null);
        },
        onTourStop: (stop) => {
            if (stop.demo) setDemo(stop.demo);
            if (stop.commerce) setSelect('j2-commerce', stop.commerce);
            if (stop.uninstallEnds) setSelect(ENDS_SELECT, stop.uninstallEnds);
        },
        cards: (
            <>
                <DatapackCards demo={demo} onOpen={setFlyout} />
                <DatapackFlyout pack={flyout} demo={demo} onClose={() => setFlyout(null)} {...(demo === DEMO_PACK ? { more } : {})} />
            </>
        ),
        window: start ? (
            <UninstallWindow
                key={`${opened}-${run}`}
                start={start}
                commerce={window.__J1__.commerce()}
                ending={window.__J1__.uninstallEnds()}
                onClose={() => setStart(null)}
                onUninstalled={() => setDemo('none')}
            />
        ) : null,
    };
}
