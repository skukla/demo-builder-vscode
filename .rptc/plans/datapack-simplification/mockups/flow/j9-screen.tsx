/**
 * J9's part of the screen behind the windows: the datapack the demo uses, its flyout, and the job
 * window open now, as decisions.md settles them (owner, 2026-11-14: "Back on track", and "Where
 * 'back' goes", confirmed):
 *
 *   main button: Update <pack> when the library copy is newer (the amber dot, hover "Newer version
 *   available"); otherwise Restore <pack>. "Update means apply what changed. Restore means go back
 *   to a previous state."
 *   More: J8-3's rows, with Undo Last Save only when there is a save before (the SC's own datapack)
 *   and Uninstall in its own section.
 *
 * The panel's "Flyout state (J9)" select picks the state: Luma (Demo Builder's) with a newer version,
 * the same with every change already applied (J9-4), Luma with your edits, My Luma with nothing
 * unsaved, My Luma with unsaved edits. An update takes the types it applied off the list; once every
 * change is in, the dot goes and the main button is Restore Luma.
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useEffect, useRef, useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect } from './j2-screen';
import { TAGS } from './j8-flyout';
import { J9RestoreWindow } from './j9-restore';
import { UpdateWindow, type UpdateStart } from './j9-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, LUMA_PACK, OTHER_PACK, type PackName } from './scenarioInstall';
import { ALL_CHANGED, type J9State } from './scenarioUpdate';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/** J9's windows, as review steps name them. */
export type J9StepWindow = Extract<StepWindow, `update${string}`>;

/** What a J9 window is: Update (from where), or Restore. */
type J9Open = { kind: 'update'; start: UpdateStart } | { kind: 'restore' };

/** Each J9 step: the flyout state, the window it opens (none: the screen), and whether the flyout shows. */
const STEP_SETUP: Record<J9StepWindow, { state: J9State; open?: J9Open; flyout?: true }> = {
    'update-dot': { state: 'luma-newer', flyout: true },
    update: { state: 'luma-newer', open: { kind: 'update', start: 'check' } },
    'update-run': { state: 'luma-newer', open: { kind: 'update', start: 'run' } },
    'update-same': { state: 'luma-applied', open: { kind: 'update', start: 'check' } },
    'update-restore': { state: 'luma-edits', open: { kind: 'restore' } },
    'update-restore-own': { state: 'my-clean', open: { kind: 'restore' } },
    'update-restore-edits': { state: 'my-edits', open: { kind: 'restore' } },
};

export const isJ9Window = (w: StepWindow): w is J9StepWindow => w in STEP_SETUP;

/** The dot's hover, decided (owner, 2026-11-14), in J4-1's form. */
const NEWER = 'Newer version available';

const SELECT = 'j9-state';
const SHOWN: readonly PackName[] = [LUMA_PACK, DEMO_PACK, OTHER_PACK];

/** The datapack the demo uses in a state. */
const packOf = (state: J9State): PackName => (state.startsWith('my-') ? DEMO_PACK : LUMA_PACK);

/** What the state is now: the select's, the changes the check will find, and whether the dot shows. */
interface J9Now {
    state: J9State;
    left: readonly string[];
    dot: boolean;
}

function fromSelect(state: J9State): J9Now {
    if (state === 'luma-newer') return { state, left: ALL_CHANGED, dot: true };
    return { state, left: [], dot: state === 'luma-applied' };
}

/** The panel's "Flyout state (J9)" select, followed as it changes; each change starts afresh. */
function useJ9State(): [J9Now, (next: J9Now) => void, (state: J9State) => void] {
    const [now, setNow] = useState<J9Now>(() => fromSelect(window.__J1__.j9State()));
    useEffect(() => {
        const select = document.getElementById(SELECT);
        const follow = (): void => setNow(fromSelect(window.__J1__.j9State()));
        select?.addEventListener('change', follow);
        return () => select?.removeEventListener('change', follow);
    }, []);
    // setSelect does nothing when the value is already set, so the state is set here as well.
    const start = (state: J9State): void => {
        setSelect(SELECT, state);
        setNow(fromSelect(state));
    };
    return [now, setNow, start];
}

const row = (key: string, label: string, icon: string) => (
    <Item key={key} textValue={label}>
        {renderMenuIcon(icon)}
        <Text>{label}</Text>
    </Item>
);

interface ActionsProps {
    pack: PackName;
    dot: boolean;
    onUpdate: () => void;
    onRestore: () => void;
}

/**
 * The bar: Update <pack> while a newer version waits, else Restore <pack>; then More. More is J8-3's:
 * Save as File; Undo Last Save and Share on the SC's own datapack (it has saves, and it can be shared);
 * Uninstall, and Delete on the SC's own, in their own section.
 */
function J9Actions({ pack, dot, onUpdate, onRestore }: ActionsProps): React.ReactElement {
    const own = TAGS[pack] === 'Mine';
    return (
        <>
            <div className="proto-note">Prototype: More&apos;s rows are built in J3, J5 and J8.</div>
            <div className="db-drawer-actions">
                <Button variant="accent" onPress={dot ? onUpdate : onRestore}>{dot ? `Update ${pack}` : `Restore ${pack}`}</Button>
                <CardActionsMenu label="More" ariaLabel={`More actions for ${pack}`} onAction={() => undefined}>
                    <Section key="pack">
                        {[row('save-file', 'Save as File', 'saveFile'), ...(own ? [row('undo', 'Undo Last Save', 'reset'), row('share', 'Share', 'share')] : [])]}
                    </Section>
                    <Section key="remove">
                        {[row('uninstall', 'Uninstall', 'delete'), ...(own ? [row('delete', 'Delete', 'delete')] : [])]}
                    </Section>
                </CardActionsMenu>
            </div>
        </>
    );
}

export interface J9Screen {
    openStep: (w: J9StepWindow) => void;
    reset: () => void;
    onTourStop: (stop: TourStop) => void;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** The state after a job, applied once its window has gone (the open window reads the state as it renders). */
type After = (now: J9Now) => J9Now;

/** An update took `codes` off the list; with none left the dot goes, and Luma is a datapack with your edits. */
const afterUpdate = (codes: string[]): After => (now) => {
    const left = now.left.filter((c) => !codes.includes(c));
    return left.length ? { ...now, left } : { state: 'luma-edits', left, dot: false };
};

/** A restore, or a check that found nothing: no dot, and Commerce holds the datapack as it was restored. */
const SETTLED: Partial<Record<J9State, J9State>> = { 'my-edits': 'my-clean', 'luma-applied': 'luma-edits' };
const afterSettled: After = (now) => ({ state: SETTLED[now.state] ?? now.state, left: [], dot: false });

/** J9's screen state. `run` redraws the open window when a panel select changes. */
export function useJ9Screen(run: number): J9Screen {
    const [now, setNow, startState] = useJ9State();
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [open, setOpen] = useState<J9Open | null>(null);
    const [opened, setOpened] = useState(0);
    const after = useRef<After | null>(null);
    const pack = packOf(now.state);
    // A state picked while the flyout is open moves the flyout to the datapack the demo now uses.
    useEffect(() => setFlyout((f) => (f ? pack : f)), [pack]);
    const show = (next: J9Open): void => {
        setFlyout(null);
        after.current = null;
        setOpened((n) => n + 1);
        setOpen(next);
    };
    const close = (): void => {
        setOpen(null);
        const apply = after.current;
        after.current = null;
        if (apply) setNow(apply(now));
    };
    const key = `${opened}-${run}`;
    const jobWindow = (): React.ReactNode => {
        if (!open) return null;
        if (open.kind === 'restore') {
            return <J9RestoreWindow key={key} pack={pack} choose={now.state === 'my-edits'} onClose={close} onSettled={() => (after.current = afterSettled)} />;
        }
        return <UpdateWindow key={key} start={open.start} left={now.left} onClose={close} onUpdated={(codes) => (after.current = afterUpdate(codes))} onUpToDate={() => (after.current = afterSettled)} />;
    };
    return {
        openStep: (w) => {
            const setup = STEP_SETUP[w];
            startState(setup.state);
            if (setup.open) show(setup.open);
            else if (setup.flyout) setFlyout(packOf(setup.state));
        },
        reset: () => {
            setOpen(null);
            setFlyout(null);
        },
        onTourStop: (stop) => {
            if (stop.j9State) startState(stop.j9State);
        },
        cards: (
            <>
                <DatapackCards demo={pack} packs={SHOWN} tags={TAGS} onOpen={setFlyout} {...(now.dot ? { newer: NEWER } : {})} />
                <DatapackFlyout
                    pack={flyout}
                    demo={pack}
                    onClose={() => setFlyout(null)}
                    {...(flyout === pack ? { actions: <J9Actions pack={pack} dot={now.dot} onUpdate={() => show({ kind: 'update', start: 'check' })} onRestore={() => show({ kind: 'restore' })} /> } : {})}
                />
            </>
        ),
        window: jobWindow(),
    };
}
