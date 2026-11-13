/**
 * The Datapacks header's actions (step-04 S1; decisions Phase 7 and 7b): in a project's Datapacks
 * the save button, Install from File, then the Clear menu set apart at the end because it deletes;
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
 * after it (step-04 Design) is not wired yet. Clear ▾ holds two items (step 06 C5; decisions J1-1):
 * Clear Demo Data clears every website the project uses, after its own window
 * (`ProjectClearWindow`); Clear Commerce Instance clears the websites the SC ticks, whoever put the
 * data there (`InstanceClearWindow`). Both run in the screen's progress window. The Command Palette
 * opens either on arrival (P6-Q5): the screen hands it over as `clearRequest`.
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
import { InstanceClearWindow } from './InstanceClearWindow';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import { ProjectClearWindow } from './ProjectClearWindow';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { DatapackId } from '@/types/datapack';
import type { ClearWindowKind } from '@/types/demoDataWipe';

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
    /** A Clear window the Command Palette asked for (P6-Q5): opened once the header can, then reported taken. */
    clearRequest?: ClearWindowKind | null;
    /** The header opened `clearRequest`. Stable. */
    onClearRequestTaken?: () => void;
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
type Open = 'load' | 'clear' | 'instance' | null;

/** The Clear menu's item key for each window. */
const CLEAR_OPENS: Record<ClearWindowKind, Open> = { project: 'clear', instance: 'instance' };

/** Clear ▾: Clear Demo Data, then Clear Commerce Instance (J1-1). */
function ClearMenu({ onPick }: { onPick: (window: Open) => void }): React.JSX.Element {
    const pick = useCallback((key: React.Key): void => onPick(CLEAR_OPENS[key === 'instance' ? 'instance' : 'project']), [onPick]);
    return (
        <CardActionsMenu label="Clear" ariaLabel="Clear" icon={renderMenuIcon('delete')} onAction={pick}>
            {[<Item key="project">Clear Demo Data</Item>, <Item key="instance">Clear Commerce Instance</Item>]}
        </CardActionsMenu>
    );
}

/** Open the window the Command Palette asked for, once the header has Clear (a project's Datapacks). */
function useClearArrivalOpens(
    canClear: boolean,
    request: ClearWindowKind | null | undefined,
    onTaken: (() => void) | undefined,
    setOpen: (open: Open) => void,
): void {
    useEffect(() => {
        if (!canClear || !request) return;
        setOpen(CLEAR_OPENS[request]);
        onTaken?.();
    }, [canClear, request, onTaken, setOpen]);
}

export function CatalogHeaderActions(props: CatalogHeaderActionsProps): React.JSX.Element {
    const { onCatalogChanged, save, mySaves, ownNames, clearRequest, onClearRequestTaken } = props;
    const [open, setOpen] = useState<Open>(null);
    const { clear, clearInstance, running, progressWindow } = useClearDemoData(onCatalogChanged);
    useClearArrivalOpens(save !== undefined, clearRequest, onClearRequestTaken, setOpen);
    // A Clear window stays until the run begins, so a refusal for an answer about a datapack's
    // changes is asked there (C3 review); the progress window then takes over.
    useEffect(() => {
        if (running) setOpen((current) => (current === 'clear' || current === 'instance' ? null : current));
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
                    <ClearMenu onPick={setOpen} />
                </>
            ) : null}
            {open === 'load' ? <LoadDatapackFileModal onClose={closeLoad} mySaves={mySaves} /> : null}
            {open === 'clear' ? <ProjectClearWindow onClose={close} onClear={startClear} {...(ownNames ? { ownNames } : {})} /> : null}
            {open === 'instance' ? <InstanceClearWindow onClose={close} onClear={clearInstance} /> : null}
            {progressWindow}
        </>
    );
}
