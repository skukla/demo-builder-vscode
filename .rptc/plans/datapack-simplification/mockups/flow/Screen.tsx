/**
 * The prototype's page: a stand-in for the Datapacks screen behind the windows, the panel's step
 * switcher, the decisions panel and the guided tours. It routes a step's window to its journey: J1's
 * Clear windows (j1-windows.tsx), J2's install window (j2-screen.tsx) or J3's save, create and undo
 * windows (j3-screen.tsx), J4's Restore windows (j4-screen.tsx), or J5's Uninstall window (j5-screen.tsx). The bundle's entry
 * (build-j1.js); split from j1-windows.tsx when J2 was added, so no file passes 500 lines.
 */

import { ActionButton, Item, Menu, MenuTrigger, Provider, Text, defaultTheme } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import React, { useEffect, useState } from 'react';
import { SaveTipHost } from './j2-parts';
import { createRoot } from 'react-dom/client';
import { InstanceClearWindow, ProjectClearWindow } from './j1-windows';
import { JOURNEYS, STEPS, type BuiltStep, type StepWindow } from './reviewSteps';
import { DecisionsPanel } from './DecisionsPanel';
import { StepGuide } from './StepGuide';
import { JourneyBar } from './JourneyBar';
import { Tour } from './Tour';
import { J1_TOUR, type TourStop } from './j1Tour';
import { J2_TOUR } from './j2Tour';
import { J3_TOUR } from './j3Tour';
import { J4_TOUR } from './j4Tour';
import { J5_TOUR } from './j5Tour';
import { J6_TOUR } from './j6Tour';
import { J7_TOUR } from './j7Tour';
import { J8_TOUR } from './j8Tour';
import { isJ3Window, useJ3Screen, type J3StepWindow } from './j3-screen';
import { isJ4Window, useJ4Screen, type J4StepWindow } from './j4-screen';
import { isJ5Window, useJ5Screen, type J5StepWindow } from './j5-screen';
import { isJ6Window, useJ6Screen, type J6StepWindow } from './j6-screen';
import { isJ7Window, useJ7Screen, type J7StepWindow } from './j7-screen';
import { isJ8Window, useJ8Screen, type J8Screen, type J8StepWindow } from './j8-screen';
import { isJ2Window, type J2Window } from './j2-windows';
import { setSelect, useJ2Screen, type J2Screen } from './j2-screen';
import type { TypeSpread } from './scenarioClear';

/** The Datapacks header's Clear menu, like New Project's. */
function ClearMenu({ onPick }: { onPick: (key: 'project' | 'instance') => void }) {
    return (
        <MenuTrigger>
            <ActionButton>
                <Text>Clear</Text>
                <ChevronDown size="S" />
            </ActionButton>
            <Menu onAction={(key) => onPick(key as 'project' | 'instance')}>
                <Item key="project">Clear Demo Data</Item>
                <Item key="instance">Clear Commerce Instance</Item>
            </Menu>
        </MenuTrigger>
    );
}

type Open = Exclude<StepWindow, 'none' | J2Window | J3StepWindow | J4StepWindow | J5StepWindow | J6StepWindow | J7StepWindow | J8StepWindow> | null;

/** The guided tours, by journey: one Start button each. */
const TOURS: Record<string, TourStop[]> = { J1: J1_TOUR, J2: J2_TOUR, J3: J3_TOUR, J4: J4_TOUR, J5: J5_TOUR, J6: J6_TOUR, J7: J7_TOUR, J8: J8_TOUR };

const STEP_KEY = 'proto-j1-step';

/** Sets the panel's "Data types" select, so the spot check drawn next reads it. */
const setSpread = (spread: TypeSpread): void => setSelect('j1-types', spread);

/** The panel selects whose change draws the open window again. */
const REDRAW_SELECTS = ['j1-types', 'j2-ending', 'j2-dry', 'j4-commerce', 'j5-ends', 'j6-retry', 'j8-screen'];

/** The step a link names (#J2-1), else the one last open, else the first. */
const stepById = (id: string | null): BuiltStep | undefined => STEPS.find((s) => s.id === id);
const firstStep = (): BuiltStep => stepById(location.hash.slice(1)) ?? stepById(localStorage.getItem(STEP_KEY)) ?? STEPS[0];

/** A panel select changed: draw the open window again, so it reads the new value. */
function useRedraw(redraw: () => void): void {
    useEffect(() => {
        const selects = REDRAW_SELECTS.map((id) => document.getElementById(id));
        selects.forEach((select) => select?.addEventListener('change', redraw));
        return () => selects.forEach((select) => select?.removeEventListener('change', redraw));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** J1's Clear windows, the one a step or the Clear menu opened. */
function J1Windows({ open, step, run, onClose }: { open: Open; step: BuiltStep; run: number; onClose: () => void }) {
    return (
        <>
            {open === 'project' && <ProjectClearWindow key={run} onClose={onClose} />}
            {open === 'instance' && <InstanceClearWindow key={run} onClose={onClose} />}
            {open === 'project-result' && <ProjectClearWindow key={run} run onClose={onClose} />}
            {open === 'project-records' && <ProjectClearWindow key={run} records={step.records ?? 'Customers'} onClose={onClose} />}
            {open === 'instance-review' && <InstanceClearWindow key={run} preset onClose={onClose} />}
            {open === 'instance-records' && <InstanceClearWindow key={run} preset records={step.records ?? 'Products'} onClose={onClose} />}
        </>
    );
}

interface TourControlsProps {
    touring: string | null;
    tourRun: number;
    onStart: (journey: string) => void;
    onExit: () => void;
    onStop: (stop: TourStop) => void;
}

/** One Start button per journey with a tour, or the tour running. */
function TourControls({ touring, tourRun, onStart, onExit, onStop }: TourControlsProps) {
    if (!touring) return null;
    return (
        <Tour
            key={tourRun}
            stops={TOURS[touring] ?? []}
            journey={JOURNEYS.find((j) => j.id === touring) ?? JOURNEYS[0]}
            onExit={onExit}
            onRestart={() => onStart(touring)}
            onStop={onStop}
        />
    );
}

/** A journey's screen as the tours and steps reset it. */
interface Resettable {
    reset: () => void;
}

/** The tour running, if any: started from the bare screen (no window, the data's own types, the panel folded). */
function useTours(closeJ1: () => void, j2: J2Screen, screens: Resettable[]) {
    const [touring, setTouring] = useState<string | null>(null);
    const [tourRun, setTourRun] = useState(0);
    const startTour = (journey: string): void => {
        closeJ1();
        j2.reset();
        screens.forEach((screen) => screen.reset());
        j2.tourDefaults();
        setSpread('data');
        document.getElementById('proto-pill')?.classList.add('collapsed');
        setTourRun((n) => n + 1);
        setTouring(journey);
    };
    const endTour = (): void => {
        setTouring(null);
        closeJ1();
        j2.reset();
        screens.forEach((screen) => screen.reset());
    };
    return { touring, tourRun, startTour, endTour };
}

interface HeadingProps {
    inView: string;
    clear: React.ReactNode;
    j3Header: React.ReactNode;
    j6Dashboard: boolean;
    j7Header: React.ReactNode;
    j8: Pick<J8Screen, 'title' | 'header'>;
}

/** The screen's heading and header: the Datapacks screen's, J6's dashboard (none), J7's Projects list, or J8's own. */
function Heading({ inView, clear, j3Header, j6Dashboard, j7Header, j8 }: HeadingProps): React.ReactElement | null {
    if (inView === 'J6' && j6Dashboard) return null;
    if (inView === 'J7' || inView === 'J8') {
        return (
            <>
                <h1>{inView === 'J7' ? 'Projects' : j8.title}</h1>
                {inView === 'J7' ? j7Header : j8.header(clear)}
            </>
        );
    }
    return (
        <>
            <h1>Datapacks</h1>
            {['J2', 'J3', 'J4', 'J5', 'J6'].includes(inView) ? null : <p>Bodea</p>}
            {inView === 'J3' ? j3Header : null}
            {clear}
        </>
    );
}

/** A stand-in for the Datapacks screen behind the window, so its size reads against a real width. */
function Screen() {
    const [step, setStep] = useState<BuiltStep>(firstStep);
    const [open, setOpen] = useState<Open>(null);
    const [run, setRun] = useState(0);
    const j2 = useJ2Screen(run);
    const j3 = useJ3Screen(run);
    const j4 = useJ4Screen(run);
    const j5 = useJ5Screen(run);
    const j6 = useJ6Screen(run);
    const j7 = useJ7Screen(run);
    const j8 = useJ8Screen(run);
    const later = [j3, j4, j5, j6, j7, j8];
    const { touring, tourRun, startTour, endTour } = useTours(() => setOpen(null), j2, later);
    const show = (key: Open): void => {
        setRun((n) => n + 1);
        setOpen(key);
    };
    const toStep = (next: BuiltStep): void => {
        localStorage.setItem(STEP_KEY, next.id);
        history.replaceState(null, '', `#${next.id}`);
        setSpread(next.spread ?? 'data');
        setStep(next);
        j2.reset();
        later.forEach((screen) => screen.reset());
        if (isJ2Window(next.window)) {
            show(null);
            j2.openStep(next.window);
        } else if (isJ3Window(next.window)) {
            show(null);
            j3.openStep(next.window);
        } else if (isJ4Window(next.window)) {
            show(null);
            j4.openStep(next.window);
        } else if (isJ5Window(next.window)) {
            show(null);
            j5.openStep(next.window);
        } else if (isJ6Window(next.window)) {
            show(null);
            j6.openStep(next.window);
        } else if (isJ7Window(next.window)) {
            show(null);
            j7.openStep(next.window);
        } else if (isJ8Window(next.window)) {
            show(null);
            j8.openStep(next.window);
        } else show(next.window === 'none' ? null : next.window);
    };
    // Which journey's screen shows: the tour's, else the chosen step's.
    const inView = touring ?? step.id.split('-')[0] ?? '';
    // Open the remembered step's window once, on load.
    useEffect(() => toStep(step), []); // eslint-disable-line react-hooks/exhaustive-deps
    useRedraw(() => setRun((n) => n + 1));
    // A tour stop sets what the stop says, on the screen of the journey touring.
    const tourStop = (journey: string | null, stop: TourStop): void => {
        if (journey === 'J3') j3.onTourStop(stop);
        else if (journey === 'J4') j4.onTourStop(stop);
        else if (journey === 'J5') j5.onTourStop(stop);
        else if (journey === 'J6') j6.onTourStop(stop);
        else if (journey === 'J7') j7.onTourStop(stop);
        else if (journey === 'J8') j8.onTourStop(stop);
        else j2.onTourStop(stop);
    };
    // A link pasted into an open page: go to its step.
    useEffect(() => {
        const onHash = (): void => {
            const linked = stepById(location.hash.slice(1));
            if (linked) toStep(linked);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="j1-screen">
            <Heading inView={inView} clear={<ClearMenu onPick={show} />} j3Header={j3.header} j6Dashboard={j6.dashboard} j7Header={j7.header} j8={j8} />
            {inView === 'J2' ? j2.cards : null}
            {inView === 'J3' ? j3.cards : null}
            {inView === 'J4' ? j4.cards : null}
            {inView === 'J5' ? j5.cards : null}
            {inView === 'J6' ? j6.cards : null}
            {inView === 'J7' ? j7.cards : null}
            {inView === 'J8' ? j8.cards : null}
            {j2.window}
            {j3.window}
            <SaveTipHost />
            {j4.window}
            {j5.window}
            {j6.window}
            {j7.window}
            {j8.window}
            {touring ? null : <JourneyBar step={step} onStep={toStep} tours={Object.keys(TOURS)} onTour={startTour} />}
            <TourControls touring={touring} tourRun={tourRun} onStart={startTour} onExit={endTour} onStop={(stop) => tourStop(touring, stop)} />
            <J1Windows open={open} step={step} run={run} onClose={() => setOpen(null)} />
            <StepGuide step={step} onStep={toStep} />
            {touring ? null : <DecisionsPanel step={step} />}
        </div>
    );
}

const root = document.getElementById('root');
if (!root) throw new Error('no #root');
document.body.classList.add('vscode-dark');
createRoot(root).render(
    <Provider theme={defaultTheme} colorScheme="dark" isQuiet UNSAFE_className="app-container">
        <Screen />
    </Provider>,
);
