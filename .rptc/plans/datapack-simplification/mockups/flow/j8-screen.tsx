/**
 * J8's screen: the Datapacks screen itself, as overview.md Phase 7 settles it.
 *
 *   The header, in order of how often an SC does each: the save button (J3's: Save ▾, Save As New,
 *   or Create Datapack), then the file action, then Clear (J1's menu), set apart. The file action is
 *   Install from File in a project's Datapacks, which opens the same install window as a card's
 *   Install (the VS Code file dialog before it is not drawn), and Add from File in the Datapack
 *   Library, which has no store, so neither the save button nor Clear.
 *   The cards: the tag on the date's line, Mine or Demo Builder; one absolute date.
 *   The flyout: its bar and More menu (`j8-flyout.tsx`).
 *
 * The panel's "Datapacks screen (J8)" select picks the screen; "Demo uses" which datapack the demo uses.
 */

import { ActionButton, Divider, Text } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect, useDemo } from './j2-screen';
import { SaveButton } from './j3-screen';
import { J8Actions, TAGS, type J8View, type MenuKey } from './j8-flyout';
import { J8Window, type J8Open } from './j8-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, OTHER_PACK, type DemoUses, type PackName } from './scenarioInstall';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/** J8's windows, as review steps name them: each shows the screen, none opens a window. */
export type J8StepWindow = Extract<StepWindow, 'header' | 'card-tags' | 'flyout-menu'>;
const J8_WINDOWS: readonly StepWindow[] = ['header', 'card-tags', 'flyout-menu'];
export const isJ8Window = (w: StepWindow): w is J8StepWindow => J8_WINDOWS.includes(w);

const SELECT = 'j8-screen';

/** Which screen shows: the panel's "Datapacks screen (J8)" select, followed as it changes. */
function useView(): [J8View, (next: J8View) => void] {
    const [view, setView] = useState<J8View>(() => window.__J1__.j8Screen());
    useEffect(() => {
        const select = document.getElementById(SELECT);
        const follow = (): void => setView(window.__J1__.j8Screen());
        select?.addEventListener('change', follow);
        return () => select?.removeEventListener('change', follow);
    }, []);
    return [view, (next) => setSelect(SELECT, next)];
}

/** What a More menu row opens, on `pack`. Save as File opens VS Code's save dialog, which is not drawn. */
function menuOpen(key: MenuKey, pack: PackName): J8Open | null {
    if (key === 'undo') return { kind: 'j3', job: { kind: 'undo' } };
    if (key === 'uninstall') return { kind: 'uninstall', pack };
    if (key === 'share' || key === 'delete') return { kind: key, pack };
    return null;
}

interface J8HeaderProps {
    view: J8View;
    demo: DemoUses;
    /** J1's Clear menu, last in a project's header. */
    clear: React.ReactNode;
    onOpen: (next: J8Open) => void;
}

/** The header: a project's save button, Install from File and Clear; the library's Add from File alone. */
function J8Header({ view, demo, clear, onOpen }: J8HeaderProps): React.ReactElement {
    if (view === 'library') {
        return (
            <div className="j8-header">
                <ActionButton isQuiet>
                    {renderMenuIcon('openFile')}
                    <Text>Add from File</Text>
                </ActionButton>
                <div className="proto-note">Prototype: Add from File opens VS Code&apos;s file dialog, not drawn.</div>
            </div>
        );
    }
    return (
        <div className="j8-header">
            <SaveButton demo={demo} onPick={(job) => onOpen({ kind: 'j3', job })} />
            <ActionButton isQuiet onPress={() => onOpen({ kind: 'install', pack: OTHER_PACK })}>
                {renderMenuIcon('openFile')}
                <Text>Install from File</Text>
            </ActionButton>
            <Divider orientation="vertical" size="S" />
            {clear}
        </div>
    );
}

export interface J8Screen {
    openStep: (w: J8StepWindow) => void;
    reset: () => void;
    onTourStop: (stop: TourStop) => void;
    /** The screen's title: Datapacks in a project, Datapack Library in the library (Phase 7). */
    title: string;
    /** The header, given J1's Clear menu to place last. */
    header: (clear: React.ReactNode) => React.ReactNode;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J8's screen state. `run` redraws the open window when a panel select changes. */
export function useJ8Screen(run: number): J8Screen {
    const [demo, setDemo] = useDemo();
    const [view, setView] = useView();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [open, setOpen] = useState<J8Open | null>(null);
    const [opened, setOpened] = useState(0);
    const show = (next: J8Open | null): void => {
        if (!next) return;
        setFlyout(null);
        setOpened((n) => n + 1);
        setOpen(next);
    };
    const actions = flyout ? (
        <J8Actions pack={flyout} view={view} inDemo={flyout === demo} switching={demo !== 'none' && flyout !== demo}
            onMain={() => show(flyout === demo ? { kind: 'restore', pack: flyout } : { kind: 'install', pack: flyout })} onMenu={(key) => show(menuOpen(key, flyout))} />
    ) : null;
    return {
        openStep: (w) => {
            setDemo(DEMO_PACK);
            setView('project');
            if (w === 'flyout-menu') setFlyout(DEMO_PACK);
        },
        reset: () => {
            setOpen(null);
            setFlyout(null);
        },
        onTourStop: (stop) => {
            if (stop.demo) setDemo(stop.demo);
            if (stop.j8View) {
                setFlyout(null);
                setView(stop.j8View);
            }
        },
        title: view === 'library' ? 'Datapack Library' : 'Datapacks',
        header: (clear) => <J8Header view={view} demo={demo} clear={clear} onOpen={show} />,
        cards: (
            <>
                <div className="j8-cards">
                    <DatapackCards demo={view === 'project' ? demo : 'none'} onOpen={setFlyout} tags={TAGS} />
                </div>
                <DatapackFlyout pack={flyout} demo={demo} onClose={() => setFlyout(null)} {...(actions ? { actions } : {})} />
            </>
        ),
        window: open ? <J8Window key={`${opened}-${run}`} open={open} demo={demo} onDemo={setDemo} onClose={() => setOpen(null)} /> : null,
    };
}
