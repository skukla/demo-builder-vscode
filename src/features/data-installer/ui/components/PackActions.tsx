/**
 * The flyout's actions (owner, 2026-10-30; step-04 S5, decisions Phase 7): one main button, and
 * everything else behind "More" (`CardActionsMenu` with a label, owner 2026-10-31: a bare ⋯ read as
 * unclear; icons from `renderMenuIcon`).
 *
 * The main button: **Install**; **Switch to <Name>** over another datapack the demo holds and Demo
 * Builder installed (J8-1, owner 2026-11-12), whose window asks "Switch to Bodea?"; and **Restore
 * <Name>** on the demo's installed version (J4-2), which opens the job window on Restore's check (S8);
 * and on a failed install of it, **Retry**, which starts the install and opens the window on its run,
 * then **Fix with AI** once retries have not helped (step-04 S8, J6-2, J6-3; `useRetryInstall`).
 * The flyout saves nothing: saving lives in the header (step-04 S1, S5).
 *
 * More, upper section: Save as File; Undo Last Save, on the datapack the demo uses when there is a
 * save to go back to (Phase 2, owner 2026-11-12); Share or Stop Sharing, on the SC's own library
 * datapack. Lower section: Uninstall, on the demo's installed version; Delete, on the SC's own library
 * datapack but never a Demo Builder one (overview Phase 7). Bare verbs (J8-3): the datapack is the
 * menu's subject, and each window's title names it ("Delete My Luma?"). A pack of saves is deleted
 * whole; a named version alone (P4-Q6 is open).
 *
 * **Undo Last Save, Share, Stop Sharing and Delete ask in a dialog** (`ConfirmActionDialog`, owner,
 * 2026-11-05). **While a menu row's work runs, the flyout waits**: its title and the medium spinner
 * its load shows, nothing else (dialog design rules), since the menu has closed and has no button to
 * spin. What each one says afterwards (where the file went, why it could not) shows under the actions.
 *
 * The Datapack Library touches no store (owner, 2026-11-07), so there the bar is More alone (Phase
 * 7b: one pinned bar, the same buttons in the same order, everywhere). Copy to the Data Installer,
 * which puts a library pack in the catalog other teams share, is not shown (`INSTALLER_WRITES_SHOWN`):
 * the Data Installer does not let our accounts write to it yet (owner, 2026-11-06), so it would fail
 * every time. The copy itself is built and tested, and its agent tool says why it is refused.
 *
 * @module features/data-installer/ui/components/PackActions
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { isSavedVersion } from '../../packVersions';
import type { DatapackDetail } from '../../types';
import { useLibrarySharing } from '../hooks/useLibrarySharing';
import type { HeldFailure } from '../hooks/useProjectHolding';
import { useRetryInstall } from '../hooks/useRetryInstall';
import { useUndoLastSave } from '../hooks/useUndoLastSave';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { type Asking, confirmCopy, deletable, failedButtonLabel, mainButtonLabel, type PackMenuRow, packRows, removeRows } from './packMenu';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { ConfirmActionDialog } from '@/core/ui/components/ui/ConfirmActionDialog';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId } from '@/types/datapack';

export interface PackActionsProps {
    detail: DatapackDetail;
    /** Install: absent in the Datapack Library. Undo opens it on its run; Restore on its check. */
    onImport?: (id: DatapackId, opensOn?: 'run' | 'restore') => void;
    /** A library pack the SC owned was removed. Stable — an effect depends on it. */
    onRemoved: () => void;
    /** The Data Installer's address is set and switched on: a library pack offers Copy to it. */
    installerOn: boolean;
    /** The warning a delete carries when this SC shared the pack in a project file. */
    sharedInFile?: string;
    /** The SC's own pack was shared or stopped being shared. Stable. */
    onSharingChanged?: () => void;
    /** Whether a menu row's work is running: the flyout hides its other content. Stable. */
    onWorking?: (working: boolean) => void;
    /** The save Undo Last Save goes back to: More offers it only when there is one (`useDetailFlyout`). */
    undoTo?: string;
    /** Uninstall: on the version whose data is in this demo's store, opening straight to its confirm (F118). */
    onRemoveData?: () => void;
    /** That same version: the main button is Restore, in place of Install (J4-2). */
    restores?: boolean;
    /** Another datapack the demo holds, which Demo Builder installed: the main button is Switch to (J8-1). */
    switches?: boolean;
    /** This version's install failed (step-04 S8): the main button is Retry, then Fix with AI. */
    failed?: HeldFailure;
    /** The data types the service holds for this version: a Retry installs every one. */
    importable?: readonly string[];
}

const NO_TYPES: readonly string[] = [];

/** What the flyout says while a menu row's work runs; a removal when it is none of the others. */
function workLines(work: {
    saveFile: { saving: boolean };
    undo: { working: boolean };
    retry: { working: boolean };
    sharing: { working: boolean };
    shared?: boolean;
}): WaitLines {
    if (work.saveFile.saving) return WAIT_STAGES.savingPackFile;
    if (work.undo.working) return WAIT_STAGES.startingUndo;
    if (work.retry.working) return WAIT_STAGES.startingInstall;
    if (work.sharing.working) return work.shared ? WAIT_STAGES.makingPackPrivate : WAIT_STAGES.sharingPack;
    return WAIT_STAGES.deletingPack;
}

export function PackActions({
    detail,
    onImport,
    onRemoved,
    installerOn,
    sharedInFile,
    onSharingChanged,
    onWorking,
    undoTo,
    onRemoveData,
    restores = false,
    switches = false,
    failed,
    importable = NO_TYPES,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved, isSavedVersion(detail.id.version));
    const sharing = useLibrarySharing(detail.id, detail.shared, onSharingChanged);
    // Undo opens the window once its job is accepted, straight on its run.
    const openRun = useCallback((id: DatapackId): void => onImport?.(id, 'run'), [onImport]);
    const undo = useUndoLastSave(detail.id.name, undoTo, openRun);
    const retry = useRetryInstall({ id: detail.id, store: detail.store, failed, types: importable }, openRun);
    const doneAsking = useCallback((): void => setAsking(null), []);
    // Still waiting once the pack is gone, as the flyout closes: its rows must not flash back.
    const working = saveFile.saving || undo.working || retry.working || sharing.working || removal.removing || removal.removed;

    // Before the paint, or the flyout's rows would show for a frame beside the spinner. The cleanup is
    // for a flyout closed during the wait, which unmounts this with the work still running.
    useLayoutEffect(() => {
        onWorking?.(working);
        return () => onWorking?.(false);
    }, [working, onWorking]);

    const onAction = (key: React.Key): void => {
        if (key === 'save-file') saveFile.start();
        else if (key === 'remove-data') onRemoveData?.();
        else if (key === 'undo' || key === 'share' || key === 'remove') setAsking(key);
    };
    const confirm = (): void => {
        setAsking(null);
        if (asking === 'undo') undo.start();
        else if (asking === 'share') sharing.start();
        else if (asking === 'remove') removal.start();
    };

    // An inferred return type keeps the row assignable to Spectrum's Item collection type.
    const renderRow = (row: PackMenuRow) => (
        <Item key={row.key} textValue={row.label}>
            {renderMenuIcon(row.icon)}
            <Text>{row.label}</Text>
        </Item>
    );
    const removing = removeRows(onRemoveData !== undefined, deletable(detail));
    return (
        <>
            {working ? (
                <div className="datapack-panel-loading">
                    <StageWait brief lines={workLines({ saveFile, undo, retry, sharing, shared: detail.shared })} />
                </div>
            ) : null}
            {/* Kept mounted through a wait: a copy's own result would be lost with it. */}
            {library && installerOn && INSTALLER_WRITES_SHOWN ? (
                <div hidden={working}>
                    <CopyToInstallerButton id={detail.id} />
                </div>
            ) : null}
            {working ? null : (
                <>
                    <div className="db-drawer-actions">
                        {onImport && failed ? <FailedButton retries={failed.retries} retry={retry} /> : null}
                        {onImport && !failed ? (
                            <Button variant="accent" onPress={() => (restores ? onImport(detail.id, 'restore') : onImport(detail.id))}>
                                {mainButtonLabel(detail, restores, switches)}
                            </Button>
                        ) : null}
                        <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                            <Section key="pack">{packRows(detail, undoTo !== undefined).map(renderRow)}</Section>
                            {removing.length > 0 ? <Section key="remove">{removing.map(renderRow)}</Section> : null}
                        </CardActionsMenu>
                    </div>
                    <PackActionNotes>
                        {saveFile.note}
                        {undo.note}
                        {retry.note}
                        {sharing.note}
                        {removal.note}
                    </PackActionNotes>
                </>
            )}
            <ConfirmActionDialog
                isOpen={asking !== null}
                {...confirmCopy(asking, detail, sharedInFile)}
                onConfirm={confirm}
                onClose={doneAsking}
            />
        </>
    );
}

/** What the actions say, under them; nothing at all when none has anything to say. */
function PackActionNotes({ children }: { children: React.ReactNode }): React.JSX.Element | null {
    const said = React.Children.toArray(children);
    return said.length > 0 ? <div className="datapack-action-notes">{said}</div> : null;
}

/** The main button on a failed install: Retry, or Fix with AI once retries have not helped. */
function FailedButton({ retries, retry }: { retries: number; retry: { start: () => void; fixWithAi: () => void } }): React.JSX.Element {
    const label = failedButtonLabel(retries);
    return (
        <Button variant="accent" onPress={label === 'Retry' ? retry.start : retry.fixWithAi}>
            {label}
        </Button>
    );
}
