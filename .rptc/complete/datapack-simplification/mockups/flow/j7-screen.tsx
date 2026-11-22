/**
 * J7's part of the screen: a stand-in for the Projects list, where reset and delete live. Each
 * project is a card with its kebab, Reset and Delete placed as the product's `ProjectActionsMenu`
 * puts them (Delete alone in a trailing section); the header's Reset Selected and Delete Selected
 * stand in for the list's selection mode (`SelectionActions`) over every project.
 *
 * Every one of them opens the product's own `ProjectsBatchModal`, unchanged (owner, 2026-11-12: "We
 * already have a modal experience we've approved for mass action, deletes, and resets."), handed
 * faked controls (`j7-batch.ts`). A project's menu opens it with that one project: today the
 * product asks a single reset or delete in VS Code dialogs instead (reported, not decided). The
 * panel's "Commerce holds" says whether the datapacks have unsaved changes, read as the window opens.
 */

import { ActionButton, DialogContainer, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { setSelect } from './j2-screen';
import { BatchSaveBody, useTraceLast, type BatchSave } from './j2-parts';
import { SaveFirstWindow } from './j2-windows';
import { useFakeBatch } from './j7-batch';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { ONE, PROJECTS, questionsFor, type ListedProject } from './scenarioReset';
import { DEMO_PACK } from './scenarioInstall';
import { nameError } from './j3-parts';
import { OWN_PACKS } from './scenarioSave';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { ProjectsBatchModal } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import type { BatchView } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import type { ProjectsBatchAction } from '@/types/projectsBatch';
import '@/core/ui/styles/scroll-fade.css';
import '@/features/projects-dashboard/ui/styles/updates-modal.css';
import '@/features/projects-dashboard/ui/styles/projects-batch.css';

/** J7's windows, as review steps name them. */
type J7Window = 'reset-one' | 'reset-several' | 'delete-one';
export type J7StepWindow = Extract<StepWindow, J7Window>;
const J7_WINDOWS: readonly StepWindow[] = ['reset-one', 'reset-several', 'delete-one'];
export const isJ7Window = (w: StepWindow): w is J7StepWindow => J7_WINDOWS.includes(w);

/** What each step opens the window on. */
const STEP_OPENS: Record<J7StepWindow, { action: ProjectsBatchAction; projects: readonly ListedProject[] }> = {
    'reset-one': { action: 'reset', projects: [ONE] },
    'reset-several': { action: 'reset', projects: PROJECTS },
    'delete-one': { action: 'delete', projects: [ONE] },
};

/** One project's card: its name and the kebab. Only the single-project project's menu opens a window. */
function ProjectCard({ name, onPick }: { name: string; onPick?: (action: ProjectsBatchAction) => void }): React.ReactElement {
    return (
        <div className="integration-card" data-project={name}>
            <div className="integration-card-head">
                <div className="integration-card-name">{name}</div>
                <CardActionsMenu ariaLabel={`More actions for ${name}`} onAction={(key) => onPick?.(key === 'delete' ? 'delete' : 'reset')}>
                    <Section key="manage">
                        <Item key="reset" textValue="Reset">
                            {renderMenuIcon('reset')}
                            <Text>Reset</Text>
                        </Item>
                    </Section>
                    <Section key="remove">
                        <Item key="delete" textValue="Delete">
                            {renderMenuIcon('delete')}
                            <Text>Delete</Text>
                        </Item>
                    </Section>
                </CardActionsMenu>
            </div>
        </div>
    );
}

/** The panel's trace label for the window's phase, so the self-check names what it measured. */
function phaseLabel(view: BatchView): string {
    if (view.phase === 'asking') return `Batch: ${view.questions.action}`;
    if (view.phase === 'closed') return 'Batch: closed';
    return `Batch: ${view.phase}`;
}

/** The datapacks with changes: the SC's own saves into itself, someone else's into a new one. */
const savesOf = (projects: readonly ListedProject[]): BatchSave[] =>
    projects.flatMap((p) => (p.pack ? [{ pack: p.pack, own: p.pack === DEMO_PACK }] : []));

/** A new datapack's name starts "My <Pack>" (J3-1), with " 2", " 3" … when that is taken. */
function freeName(pack: string, taken: readonly string[]): string {
    const base = `My ${pack}`;
    const isTaken = (name: string): boolean => taken.some((t) => t.toLowerCase() === name.toLowerCase());
    let name = base;
    for (let n = 2; isTaken(name); n += 1) name = `${base} ${n}`;
    return name;
}

/** Where each datapack's changes start going: the SC's own into itself, someone else's into "My <Pack>". */
const startingNames = (saves: readonly BatchSave[]): Record<string, string> =>
    Object.fromEntries(saves.map((s) => [s.pack, s.own ? s.pack : freeName(s.pack, OWN_PACKS)]));

/** The names a row may not take: the SC's datapacks, less its own pack (saving into it), and the other rows'. */
const takenFor = (pack: string, names: Record<string, string>): string[] => [
    ...OWN_PACKS.filter((own) => own !== pack),
    ...Object.entries(names).filter(([other]) => other !== pack).map(([, name]) => name),
];

/** What the open window is over: the action, and the datapacks' changes when there are any. */
interface Opened {
    action: ProjectsBatchAction;
    saves: BatchSave[];
}

/**
 * The product's window over the faked controls, traced for the panel's measurement. With unsaved
 * changes its own Datapack Changes step is replaced by J2 and J5's "Save Your Changes First?"
 * (owner, 2026-11-12): the window is handed no changes, so its button runs, and that press opens
 * the save question before the run starts.
 */
function J7Window({ batch, opened }: { batch: ReturnType<typeof useFakeBatch>; opened: Opened }): React.ReactElement {
    const [saving, setSaving] = useState(false);
    const [names, setNames] = useState(() => startingNames(opened.saves));
    useTraceLast(saving ? 'Batch: save first' : phaseLabel(batch.view));
    if (saving) {
        const verb = opened.action === 'delete' ? 'Delete' : 'Reset';
        const errors = Object.fromEntries(Object.entries(names).map(([pack, name]) => [pack, nameError(name, takenFor(pack, names))]));
        const refused = Object.values(errors).some((e) => e !== undefined);
        const onName = (pack: string, name: string): void => setNames((previous) => ({ ...previous, [pack]: name }));
        const body = <BatchSaveBody rows={opened.saves} names={names} errors={errors} onName={onName} />;
        const close = (): void => {
            setSaving(false);
            batch.close();
        };
        const run = (): void => {
            setSaving(false);
            batch.run();
        };
        return (
            <DialogContainer onDismiss={close}>
                <SaveFirstWindow verb={verb} onRun={run} onClose={close} body={body} saveDisabled={refused} />
            </DialogContainer>
        );
    }
    const controls = opened.saves.length > 0 ? { ...batch, run: () => setSaving(true) } : batch;
    return <ProjectsBatchModal controls={controls} />;
}

export interface J7Screen {
    openStep: (w: J7StepWindow) => void;
    reset: () => void;
    onTourStop: (stop: TourStop) => void;
    header: React.ReactNode;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J7's screen state. `run` redraws the open window when a panel select changes. */
export function useJ7Screen(run: number): J7Screen {
    const [opened, setOpened] = useState<Opened | null>(null);
    const batch = useFakeBatch(() => setOpened(null));
    const open = (action: ProjectsBatchAction, projects: readonly ListedProject[]): void => {
        const unsaved = window.__J1__.commerce() === 'unsaved';
        setOpened({ action, saves: unsaved ? savesOf(projects) : [] });
        // The window is told of no changes: the save question below asks about them instead.
        batch.open(questionsFor(action, projects, 'clean'));
    };
    return {
        openStep: (w) => open(STEP_OPENS[w].action, STEP_OPENS[w].projects),
        reset: batch.close,
        onTourStop: (stop) => {
            if (stop.commerce) setSelect('j2-commerce', stop.commerce);
        },
        header: (
            <div className="projects-select-bar">
                <ActionButton isQuiet onPress={() => open('reset', PROJECTS)}>
                    {renderMenuIcon('reset')}
                    <Text>Reset Selected</Text>
                </ActionButton>
                <ActionButton isQuiet onPress={() => open('delete', PROJECTS)}>
                    {renderMenuIcon('delete')}
                    <Text>Delete Selected</Text>
                </ActionButton>
            </div>
        ),
        cards: (
            <div className="datapack-grid j2-cards">
                {PROJECTS.map((p) => (
                    <ProjectCard key={p.name} name={p.name} {...(p.name === ONE.name ? { onPick: (action: ProjectsBatchAction) => open(action, [ONE]) } : {})} />
                ))}
            </div>
        ),
        window: opened ? <J7Window key={run} batch={batch} opened={opened} /> : null,
    };
}
