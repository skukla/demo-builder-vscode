/**
 * J3's part of the screen behind the windows: the header's save button, the cards and their flyout,
 * and the J3 window open now. Saving lives in the header only (overview.md Phase 7b): on the SC's own
 * datapack a menu button, Save ▾, with Save and Save As New; on someone else's a plain Save As New;
 * with no datapack yet, Create Datapack. The choice is made before any window opens. Undo Last Save
 * is in the flyout's More menu on the datapack the demo uses (Phase 2). The panel's "Demo uses"
 * select is the source of truth for which datapack that is, as in J2.
 */

import { ActionButton, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import React, { useEffect, useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect, useDemo } from './j2-screen';
import { J3Window, type J3Job } from './j3-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, OTHER_PACK, type DemoUses, type PackName } from './scenarioInstall';
import { OWN_PACKS, SAVE_DEMO, type SaveVariant } from './scenarioSave';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';

/** J3's windows, as review steps name them. */
export type J3StepWindow = Extract<StepWindow, 'save' | 'create' | 'undo'>;
const J3_WINDOWS: readonly StepWindow[] = ['save', 'create', 'undo'];
export const isJ3Window = (w: StepWindow): w is J3StepWindow => J3_WINDOWS.includes(w);

/** The cards before Create Datapack: none of the SC's yet, so only Bodea. */
const BEFORE_CREATE: readonly PackName[] = [OTHER_PACK];

/** Which datapack the demo uses at a J3 step: none before Create, else the save's, else My Luma. */
function demoForStep(w: J3StepWindow, variant: SaveVariant): DemoUses {
    if (w === 'create') return 'none';
    if (w === 'save') return SAVE_DEMO[variant];
    return DEMO_PACK;
}

/** The panel's "Save (J3-1)" select changed while a save is open: open the save it now names. */
function useSaveVariant(job: J3Job | null, reopen: () => void): void {
    useEffect(() => {
        const select = document.getElementById('j3-save');
        const follow = (): void => {
            if (job?.kind === 'save') reopen();
        };
        select?.addEventListener('change', follow);
        return () => select?.removeEventListener('change', follow);
    });
}

/** The header's save button: decided by which datapack the demo uses, before any window opens. */
export function SaveButton({ demo, onPick }: { demo: DemoUses; onPick: (job: J3Job) => void }): React.ReactElement {
    if (demo === 'none') return <ActionButton onPress={() => onPick({ kind: 'create' })}><Text>Create</Text></ActionButton>;
    if (!OWN_PACKS.includes(demo)) return <ActionButton onPress={() => onPick({ kind: 'save', variant: 'as-new-other' })}><Text>Save As New</Text></ActionButton>;
    return (
        <MenuTrigger>
            <ActionButton>
                <Text>Save</Text>
                <ChevronDown size="S" />
            </ActionButton>
            <Menu onAction={(key) => onPick({ kind: 'save', variant: key === 'as-new' ? 'as-new' : 'save' })}>
                <Item key="save">Save</Item>
                <Item key="as-new">Save As New</Item>
            </Menu>
        </MenuTrigger>
    );
}

export interface J3Screen {
    /** Open a J3 review step's window, over the datapack the step says the demo uses. */
    openStep: (w: J3StepWindow) => void;
    /** Back to the bare screen: no window, no flyout, every card. */
    reset: () => void;
    /** A tour stop began: set what it says the demo uses. */
    onTourStop: (stop: TourStop) => void;
    header: React.ReactNode;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J3's screen state. `run` redraws the open window when a panel select changes. */
export function useJ3Screen(run: number): J3Screen {
    const [demo, setDemo] = useDemo();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [job, setJob] = useState<J3Job | null>(null);
    const [packs, setPacks] = useState<readonly PackName[] | undefined>();
    const [opened, setOpened] = useState(0);
    const open = (next: J3Job): void => {
        setFlyout(null);
        setOpened((n) => n + 1);
        setJob(next);
    };
    // A create named My Luma makes its card, with the check: the header then reads Save ▾.
    const onDone = (done: J3Job, name: string): void => {
        if (done.kind !== 'create' || name !== DEMO_PACK) return;
        setPacks(undefined);
        setDemo(DEMO_PACK);
    };
    const more = (
        <CardActionsMenu label="More" ariaLabel={`More actions for ${DEMO_PACK}`} onAction={() => open({ kind: 'undo' })}>
            <Item key="undo">Undo Last Save</Item>
        </CardActionsMenu>
    );
    const openStep = (w: J3StepWindow): void => {
        const variant = window.__J1__.saveVariant();
        setDemo(demoForStep(w, variant));
        setPacks(w === 'create' ? BEFORE_CREATE : undefined);
        open(w === 'save' ? { kind: 'save', variant } : { kind: w });
    };
    useSaveVariant(job, () => openStep('save'));
    return {
        openStep,
        reset: () => {
            setJob(null);
            setFlyout(null);
        },
        onTourStop: (stop) => {
            if (stop.demo) setDemo(stop.demo);
            if (stop.demo === 'none') setPacks(BEFORE_CREATE);
            if (stop.saveVariant) setSelect('j3-save', stop.saveVariant);
        },
        header: <SaveButton demo={demo} onPick={open} />,
        cards: (
            <>
                <DatapackCards demo={demo} onOpen={setFlyout} {...(packs ? { packs } : {})} />
                <DatapackFlyout pack={flyout} demo={demo} onClose={() => setFlyout(null)} {...(demo === DEMO_PACK ? { more } : {})} />
            </>
        ),
        window: job ? <J3Window key={`${opened}-${run}`} job={job} onClose={() => setJob(null)} onDone={onDone} /> : null,
    };
}
