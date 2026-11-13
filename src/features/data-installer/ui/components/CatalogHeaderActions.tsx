/**
 * The Datapacks header's actions (step-04 S1; decisions Phase 7 and 7b): in a project's Datapacks
 * the save button, Install from File, then Clear Demo Data set apart at the end because it deletes;
 * in the Datapack Library Add from File alone, since the library touches no store (owner,
 * 2026-11-07).
 *
 * The save button is one state (`headerSave`), decided before it is drawn: a button's words never
 * change while it is on screen (7b). Until the project and the catalog have answered it is the
 * header's waiting button (disabled, a spinner, no words, as its Refresh is while it reads). Then:
 * Create with no datapack; Save ▾ (Save, Save As New) on the SC's own; a plain Save As New on
 * someone else's; nothing when the datapack has no install record (P4-Q4). Each choice opens
 * today's flow, through the handlers it is given.
 *
 * Install from File opens today's file load, which adds the datapack to My Datapacks; the job window
 * after it (step-04 Design) is not wired yet. Clear Demo Data clears every website the project uses
 * (datapack-engine step 10; step 06), after its own window (`ProjectClearWindow`), in the screen's
 * progress window.
 *
 * Quiet buttons with icons (`ActionButton isQuiet`, as the header's own Refresh and view toggles;
 * glyphs from `renderMenuIcon`). Each action owns the dialog it opens, so the catalog view carries no
 * dialog's state.
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { ActionButton, Divider, Item, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { HeaderSave } from '../headerSave';
import { useClearDemoData } from '../hooks/useClearDemoData';
import type { RemovalAnswer } from '../hooks/useSwitchChanges';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import { ProjectClearWindow } from './ProjectClearWindow';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { DatapackId } from '@/types/datapack';

/** The save button's state, and the flow each of its choices opens. Handlers stable. */
export interface HeaderSaveActions {
    state: HeaderSave;
    /** Create: a new datapack from the project's store. */
    onCreate: () => void;
    /** Save: into the SC's own datapack, as a new version. */
    onSave: () => void;
    /** Save As New: a new datapack of the SC's from the one the project holds. */
    onSaveAsNew: () => void;
}

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /** A project's Datapacks: the save button, and Install from File and Clear. Absent in the Datapack Library. */
    save?: HeaderSaveActions;
    /** The SC's own datapacks in My Datapacks: the file load asks to replace only one of these. */
    mySaves?: readonly DatapackId[];
    /** The SC's own datapacks' names: Clear's save question may not name a new one after them. Must be stable. */
    ownNames?: readonly string[];
}

/** The save button, as its state says (`headerSave`). */
function SaveButton({ save }: { save: HeaderSaveActions }): React.JSX.Element | null {
    const { state, onCreate, onSave, onSaveAsNew } = save;
    const pick = useCallback((key: React.Key): void => (key === 'as-new' ? onSaveAsNew() : onSave()), [onSave, onSaveAsNew]);
    if (state === 'none') return null;
    if (state === 'pending') {
        return (
            <ActionButton isQuiet isDisabled aria-label="Loading">
                <Spinner size="S" />
            </ActionButton>
        );
    }
    if (state === 'save-menu') {
        return (
            <CardActionsMenu label="Save" ariaLabel="Save" icon={renderMenuIcon('capture')} onAction={pick}>
                {[<Item key="save">Save</Item>, <Item key="as-new">Save As New</Item>]}
            </CardActionsMenu>
        );
    }
    const create = state === 'create';
    return (
        <ActionButton isQuiet onPress={create ? onCreate : onSaveAsNew}>
            {renderMenuIcon(create ? 'add' : 'capture')}
            {create ? <Text>Create</Text> : <Text>Save As New</Text>}
        </ActionButton>
    );
}

/** Which dialog the header has open. */
type Open = 'load' | 'clear' | null;

export function CatalogHeaderActions({ onCatalogChanged, save, mySaves, ownNames }: CatalogHeaderActionsProps): React.JSX.Element {
    const [open, setOpen] = useState<Open>(null);
    const { clear, running, progressWindow } = useClearDemoData(onCatalogChanged);
    // The Clear window stays until the run begins, so a refusal for an answer about the datapack's
    // changes is asked there (C3 review); the progress window then takes over.
    useEffect(() => {
        if (running) setOpen((current) => (current === 'clear' ? null : current));
    }, [running]);

    const close = useCallback((): void => setOpen(null), []);
    const startClear = useCallback(
        (token: string, websites: string[], answer?: RemovalAnswer): Promise<boolean> => clear(token, websites, answer),
        [clear],
    );
    // Stable, because the load modal's effect depends on it.
    const closeLoad = useCallback((): void => {
        setOpen(null);
        onCatalogChanged();
    }, [onCatalogChanged]);

    return (
        <>
            {save ? <SaveButton save={save} /> : null}
            <ActionButton isQuiet onPress={() => setOpen('load')}>
                {renderMenuIcon('openFile')}
                {save ? <Text>Install from File</Text> : <Text>Add from File</Text>}
            </ActionButton>
            {save ? (
                <>
                    <Divider orientation="vertical" size="S" />
                    <ActionButton isQuiet onPress={() => setOpen('clear')}>
                        {renderMenuIcon('delete')}
                        <Text>Clear Demo Data</Text>
                    </ActionButton>
                </>
            ) : null}
            {open === 'load' ? <LoadDatapackFileModal onClose={closeLoad} mySaves={mySaves} /> : null}
            {open === 'clear' ? <ProjectClearWindow onClose={close} onClear={startClear} {...(ownNames ? { ownNames } : {})} /> : null}
            {progressWindow}
        </>
    );
}
