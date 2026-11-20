/**
 * The flyout's actions, visible as one list (owner, 2026-11-17, matching the integration flyouts:
 * a menu is easy to miss; the shared `FlyoutActionList`). It replaced one main button and a "More"
 * menu (step-04 S5, decisions Phase 7). The first row is the main action, then the rest, then the
 * ones that take something away, behind a divider: Uninstall, then Delete, the only one in red.
 *
 * The main action: **Install**; **Switch to <Name>** over another datapack the demo holds and Demo
 * Builder installed (J8-1, owner 2026-11-12), whose window asks "Switch to Bodea?"; **Update <Name>**
 * on the demo's installed version while a newer version waits (J9-1), which opens the job window on
 * Update's check; otherwise **Restore <Name>** there (J4-2), which opens it on Restore's check (S8);
 * and on a failed install of it, **Retry**, which starts the install and opens the window on its run,
 * then **Fix with AI** once retries have not helped (step-04 S8, J6-2, J6-3; `useRetryInstall`).
 * The flyout saves nothing: saving lives in the header (step-04 S1, S5).
 *
 * Then: Save as File; Undo Last Save, on the datapack the demo uses when there is a
 * save to go back to (Phase 2, owner 2026-11-12); Share or Stop Sharing, on the SC's own library
 * datapack (no screen marks a pack as Demo Builder's: walk F226). Behind the divider: Uninstall, on the demo's installed version; Delete, on the SC's own library
 * datapack but never a Demo Builder one (overview Phase 7). Bare verbs (J8-3): the datapack is the
 * list's subject, and each window's title names it ("Delete My Luma?"). A pack of saves is deleted
 * whole; a named version alone (P4-Q6 is open).
 *
 * **Undo Last Save, Share, Stop Sharing, the two mark rows and Delete ask in a dialog** (`ConfirmActionDialog`, owner,
 * 2026-11-05). **While a menu row's work runs, the flyout waits**: its title and the medium spinner
 * its load shows, nothing else (dialog design rules), since a row has no button to spin. What each one says afterwards (where the file went, why it could not) shows under the actions.
 *
 * The Datapack Library touches no store (owner, 2026-11-07), so there the list has no main action. Copy to the Data Installer,
 * which puts a library pack in the catalog other teams share, is not shown (`INSTALLER_WRITES_SHOWN`):
 * the Data Installer does not let our accounts write to it yet (owner, 2026-11-06), so it would fail
 * every time. The copy itself is built and tested, and its agent tool says why it is refused.
 *
 * @module features/data-installer/ui/components/PackActions
 */

import React, { useCallback, useLayoutEffect, useState } from 'react';
import { DELETE, UNINSTALL } from '../../datapackWords';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { isSavedVersion } from '../../packVersions';
import type { DatapackDetail } from '../../types';
import { inUseLine, type PackInUse, useDeleteCheck } from '../hooks/useDeleteCheck';
import { useLibrarySharing } from '../hooks/useLibrarySharing';
import type { HeldFailure } from '../hooks/useProjectHolding';
import { useRetryInstall } from '../hooks/useRetryInstall';
import { useUndoLastSave } from '../hooks/useUndoLastSave';
import type { HeldSaves } from '../installedPackProps';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { type Asking, confirmCopy, deletable, mainButtonLabel, packRows, removeRows, saveRows } from './packMenu';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { ConfirmActionDialog } from '@/core/ui/components/ui/ConfirmActionDialog';
import { type FlyoutActionRow, FlyoutActionList } from '@/core/ui/components/ui/FlyoutActionList';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { failedButtonLabel } from '@/core/utils/fixWithAi';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId } from '@/types/datapack';

export interface PackActionsProps {
    detail: DatapackDetail;
    /** Install: absent in the Datapack Library. Undo opens it on its run; Restore and Update on their checks. */
    onImport?: (id: DatapackId, opensOn?: 'run' | 'restore' | 'update') => void;
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
    /** That same version while an update waits: the main button is Update, in place of Restore (J9-1). */
    updates?: boolean;
    /** Another datapack the demo holds, which Demo Builder installed: the main button is Switch to (J8-1). */
    switches?: boolean;
    /** This version's install failed (step-04 S8): the main button is Retry, then Fix with AI. */
    failed?: HeldFailure;
    /** The data types the service holds for this version: a Retry installs every one. */
    importable?: readonly string[];
    /** The installed version's saves: Update and Save As New, under the main action (walk F219). */
    saves?: HeldSaves | undefined;
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
    updates = false,
    switches = false,
    failed,
    importable = NO_TYPES,
    saves,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved, isSavedVersion(detail.id.version));
    const deleteCheck = useDeleteCheck(detail.id, isSavedVersion(detail.id.version));
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

    const onAction = (key: string): void => {
        if (key === 'main' && onImport) openMain(onImport, detail.id, mainOpensOn(restores, updates));
        else if (key === 'retry') retry.start();
        else if (key === 'fix-with-ai') retry.fixWithAi();
        else if (key === 'save-file') saveFile.start();
        else if (key === 'remove-data') onRemoveData?.();
        else if (key === 'update-pack') saves?.onUpdate?.();
        else if (key === 'save-as-new') saves?.onSaveAsNew();
        // Delete asks who uses the datapack first, and says so in place of the question (owner, 2026-11-20).
        else if (key === 'remove') deleteCheck.start(() => setAsking('remove'));
        else if (isAsked(key)) setAsking(key);
    };
    const confirm = (): void => {
        setAsking(null);
        if (asking === 'undo') undo.start();
        else if (asking === 'share') sharing.start();
        else if (asking === 'remove') removal.start();
    };

    const rows: FlyoutActionRow[] = [
        ...(onImport ? [mainRow(detail, { restores, updates, switches, failed })] : []),
        ...saveRows(saves),
        ...packRows(detail, undoTo !== undefined),
        // Both take something away; only Delete is for good, so only it is red (owner, 2026-11-17).
        ...removeRows(onRemoveData !== undefined, deletable(detail)).map((row) => ({
            ...row,
            removes: true,
            danger: row.key === 'remove',
            pending: row.key === 'remove' && deleteCheck.checking,
        })),
    ];
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
                    <FlyoutActionList rows={rows} onAction={onAction} />
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
            <InUseWindow
                name={detail.displayName}
                inUse={deleteCheck.inUse}
                onUninstall={onRemoveData}
                onClose={deleteCheck.dismiss}
            />
        </>
    );
}

/**
 * Delete refused before it asks: the datapack as the title, "Couldn't Delete" under the amber mark
 * (every result's "Couldn't <action>", the shared action word), who uses it and where to uninstall
 * it; Uninstall beside Close when the open demo is the one (owner, 2026-11-20, mockup 2a and 2b; "In
 * Use" was a word of its own).
 */
function InUseWindow({
    name,
    inUse,
    onUninstall,
    onClose,
}: {
    name: string;
    inUse: PackInUse | undefined;
    onUninstall: (() => void) | undefined;
    onClose: () => void;
}): React.JSX.Element {
    const uninstall =
        inUse?.open && onUninstall
            ? { label: UNINSTALL, onPress: () => { onClose(); onUninstall(); } }
            : undefined;
    return (
        <ResultDialog
            isOpen={inUse !== undefined}
            title={name}
            outcome={`Couldn't ${DELETE}`}
            status="warning"
            {...(uninstall ? { action: uninstall } : {})}
            onClose={onClose}
        >
            {inUse ? inUseLine(inUse) : null}
        </ResultDialog>
    );
}

/** The rows that ask in a dialog first. */
const ASKED: readonly string[] = ['undo', 'share', 'remove'];
function isAsked(key: string): key is NonNullable<Asking> {
    return ASKED.includes(key);
}

/** Where the main button opens the job window: Update's check, Restore's, or an install's. */
function mainOpensOn(restores: boolean, updates: boolean): 'update' | 'restore' | undefined {
    if (updates) return 'update';
    return restores ? 'restore' : undefined;
}

/** Open the job window from the main button; an install's opens on its check, with nothing more said. */
function openMain(onImport: NonNullable<PackActionsProps['onImport']>, id: DatapackId, opensOn: 'update' | 'restore' | undefined): void {
    if (opensOn) onImport(id, opensOn);
    else onImport(id);
}

/** What the actions say, under them; nothing at all when none has anything to say. */
function PackActionNotes({ children }: { children: React.ReactNode }): React.JSX.Element | null {
    const said = React.Children.toArray(children);
    return said.length > 0 ? <div className="datapack-action-notes">{said}</div> : null;
}

/**
 * The first row: Install, Switch to, Install Newer Version or Restore; on a failed install, Retry,
 * then Fix with AI once retries have not helped.
 */
function mainRow(
    detail: DatapackDetail,
    held: { restores: boolean; updates: boolean; switches: boolean; failed?: HeldFailure },
): FlyoutActionRow {
    if (held.failed) {
        const label = failedButtonLabel(held.failed.retries);
        return label === 'Retry' ? { key: 'retry', label, icon: 'reset' } : { key: 'fix-with-ai', label, icon: 'ai' };
    }
    const label = mainButtonLabel(detail, held.restores, held.switches, held.updates);
    return { key: 'main', label, icon: held.restores && !held.updates ? 'reset' : 'install' };
}
