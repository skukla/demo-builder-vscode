/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view, and everything else
 * is behind a "More" button (`CardActionsMenu` with a label, owner 2026-10-31: a bare ⋯ beside
 * Import read as unclear; icons from `renderMenuIcon`), where it was five buttons
 * on three rows. In the menu, in order: Save as file; Undo Last Save, on the datapack the demo uses
 * when there is a save to go back to (Phase 2, owner 2026-11-12: the datapack keeps its two newest
 * saves, and the undo goes back to the one before the newest); Share or Stop sharing, on the SC's own
 * library pack; and Delete Datapack, the same pack only, in its own section at the bottom. A pack of
 * saves is deleted whole.
 * The demo's own pack, when it is the SC's, leads with Save Changes, which writes what its store now
 * holds as a new version, with Import beside it (owner, 2026-11-04); a new pack is the header's
 * Create Datapack.
 * A pack whose settings layer is the SC's own also offers "Delete Store Configuration" there, since a
 * layer has no card of its own to remove it from (datapack-engine step 09).
 *
 * **Undo Last Save, Share, Stop sharing and both removes ask in a dialog** (`ConfirmActionDialog`,
 * owner, 2026-11-05). Remove used to ask only when the pack was shared in a project file, though it cannot
 * be undone either way. **While a menu row's work runs, the flyout waits**: its title and the medium
 * spinner its load shows, nothing else (dialog design rules), since the menu has closed and has no
 * button to spin. What each one says afterwards (where the file went, why it could not) shows under
 * the actions.
 *
 * The demo's installed version's main button is **Restore <name>** (J4-2), which opens the job
 * window on Restore's check (S8): the check, its question and its run are the window's.
 *
 * Every pack offers Import in a project's Datapacks: Demo Builder installs a library pack and a
 * Data Installer pack alike. The Datapack Library touches no store (owner, 2026-11-07), so there
 * the menu's rows are the buttons, Save as File and Share, and More holds only what removes.
 * Copy to the Data Installer, which puts a library pack in the catalog other teams share, is not
 * shown (`INSTALLER_WRITES_SHOWN`): the Data Installer does not let our accounts write to it yet
 * (owner, 2026-11-06), so it would fail every time. The copy itself is built and tested, and its
 * agent tool says why it is refused.
 *
 * @module features/data-installer/ui/components/PackActions
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { INSTALL, RESTORE } from '../../datapackWords';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { isSavedVersion } from '../../packVersions';
import { SHARE_CONSENT } from '../../shareWording';
import type { DatapackDetail, PackDetailLayer } from '../../types';
import { useLibrarySharing } from '../hooks/useLibrarySharing';
import { useUndoLastSave } from '../hooks/useUndoLastSave';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { ConfirmActionDialog, type ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId } from '@/types/datapack';

export interface PackActionsProps {
    detail: DatapackDetail;
    /** Import: absent in the Datapack Library. Undo opens it on its run; Restore on its check. */
    onImport?: (id: DatapackId, opensOn?: 'run' | 'restore') => void;
    /** Save Changes: on the demo's pack, whoever owns it. */
    onSaveChanges?: () => void;
    /** It makes a new pack of the SC's: the button reads Save As New Datapack (owner, 2026-11-09). */
    saveAsNew?: boolean;
    /** A library pack the SC owned was removed. Stable — an effect depends on it. */
    onRemoved: () => void;
    /** The Data Installer's address is set and switched on: a library pack offers Copy to it. */
    installerOn: boolean;
    /** The warning a delete carries when this SC shared the pack in a project file. */
    sharedInFile?: string;
    /** The SC's own pack was shared or stopped being shared, or its settings layer was removed. Stable. */
    onSharingChanged?: () => void;
    /** The settings layer Import will apply after the pack's data (step 09). */
    settingsLayer?: PackDetailLayer;
    /** Whether a menu row's work is running: the flyout hides its other content. Stable. */
    onWorking?: (working: boolean) => void;
    /** The save Undo Last Save goes back to: More offers it only when there is one (`useDetailFlyout`). */
    undoTo?: string;
    /** Remove Data: on the version whose data is in this demo's store, opening straight to its confirm (F118). */
    onRemoveData?: () => void;
    /** That same version: the main button is Restore, in place of Install (J4-2). */
    restores?: boolean;
}

/** One menu row: its icon and label. */
interface Row {
    key: string;
    label: string;
    icon: string;
}

/** The menu's upper section: what any pack offers, then what the SC's own library pack adds. */
function packRows(detail: DatapackDetail, undoable: boolean): Row[] {
    const rows: Row[] = [{ key: 'save-file', label: 'Save as File', icon: 'saveFile' }];
    if (undoable) rows.push({ key: 'undo', label: 'Undo Last Save', icon: 'reset' });
    if (detail.store === 'library' && detail.mine) {
        rows.push({ key: 'share', label: detail.shared ? 'Stop Sharing' : 'Share', icon: 'share' });
    }
    return rows;
}

/** The menu's lower section: what takes the demo's data out of its store, then what leaves the library. */
function removeRows(ownPack: boolean, ownLayer: boolean, removesData: boolean): Row[] {
    return [
        // Uninstall, the pair of Install (owner, 2026-11-09, walk F120): "Remove Data" read as all data.
        ...(removesData ? [{ key: 'remove-data', label: 'Uninstall', icon: 'delete' }] : []),
        // Delete, not Remove (owner, 2026-11-09, walk F118): it leaves the library for good, where
        // Uninstall takes a demo's data out of its store and an import puts it back.
        ...(ownPack ? [{ key: 'remove', label: 'Delete Datapack', icon: 'delete' }] : []),
        ...(ownLayer ? [{ key: 'remove-settings', label: 'Delete Store Configuration', icon: 'delete' }] : []),
    ];
}

/** The dialog open over the flyout, if any. */
type Asking = 'undo' | 'share' | 'remove' | 'remove-settings' | null;

type ConfirmCopy = Pick<ConfirmActionDialogProps, 'title' | 'actionLabel' | 'actionVariant' | 'children'>;

/** What a dialog asks. The title of a closed one is never drawn. */
function confirmCopy(asking: Asking, detail: DatapackDetail, sharedInFile?: string): ConfirmCopy {
    const name = detail.displayName;
    if (asking === 'undo') {
        // Blue: red is for deleting and removing only (rule 20; owner, 2026-11-12: "Too strong.").
        return {
            title: 'Undo Last Save?',
            actionLabel: 'Undo',
            actionVariant: 'accent',
            children: `Commerce goes back to ${name} as it was before your last save. Anything you changed since is lost.`,
        };
    }
    if (asking === 'share' && !detail.shared) {
        return { title: `Share ${name}?`, actionLabel: 'Share', actionVariant: 'accent', children: SHARE_CONSENT };
    }
    if (asking === 'share') {
        return {
            title: `Stop Sharing ${name}?`,
            actionLabel: 'Stop Sharing',
            actionVariant: 'accent',
            children: 'Other people can no longer see or install it.',
        };
    }
    if (asking === 'remove-settings') {
        return {
            title: `Delete ${name}'s Store Configuration?`,
            actionLabel: 'Delete',
            actionVariant: 'negative',
            // The house form for a warning: a word in the main sentence (dialog design rules).
            children: 'Permanently deletes the store configuration saved with it.',
        };
    }
    // A pack of saves goes whole, every save with it (owner, 2026-11-09).
    const what = isSavedVersion(detail.id.version) ? 'it' : `version ${detail.id.version}`;
    // "Permanently" is the warning, as a word in the sentence (dialog design rules; review 2026-11-10).
    return {
        title: `Delete ${name}?`,
        actionLabel: 'Delete',
        actionVariant: 'negative',
        children: [`Permanently deletes ${what}.`, sharedInFile],
    };
}

/** What the flyout says while a menu row's work runs; a removal when it is none of the others. */
function workLines(work: {
    saveFile: { saving: boolean };
    undo: { working: boolean };
    sharing: { working: boolean };
    layerRemoval: { removing: boolean };
    shared?: boolean;
}): WaitLines {
    if (work.saveFile.saving) return WAIT_STAGES.savingPackFile;
    if (work.undo.working) return WAIT_STAGES.startingUndo;
    if (work.sharing.working) return work.shared ? WAIT_STAGES.makingPackPrivate : WAIT_STAGES.sharingPack;
    if (work.layerRemoval.removing) return WAIT_STAGES.deletingPackSettings;
    return WAIT_STAGES.deletingPack;
}

export function PackActions({
    detail,
    onImport,
    onSaveChanges,
    saveAsNew = false,
    onRemoved,
    installerOn,
    sharedInFile,
    onSharingChanged,
    settingsLayer,
    onWorking,
    undoTo,
    onRemoveData,
    restores = false,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved, isSavedVersion(detail.id.version));
    const layerRemoval = useLibraryRemoval(settingsLayer?.id ?? detail.id, onSharingChanged);
    const sharing = useLibrarySharing(detail.id, detail.shared, onSharingChanged);
    // Undo opens the window once its job is accepted, straight on its run.
    const openRun = useCallback((id: DatapackId): void => onImport?.(id, 'run'), [onImport]);
    const undo = useUndoLastSave(detail.id.name, undoTo, openRun);
    const doneAsking = useCallback((): void => setAsking(null), []);
    // Still waiting once the pack is gone, as the flyout closes: its rows must not flash back.
    const working =
        saveFile.saving || undo.working || sharing.working || removal.removing || removal.removed || layerRemoval.removing;

    // Before the paint, or the flyout's rows would show for a frame beside the spinner. The cleanup is
    // for a flyout closed during the wait, which unmounts this with the work still running.
    useLayoutEffect(() => {
        onWorking?.(working);
        return () => onWorking?.(false);
    }, [working, onWorking]);

    const onAction = (key: React.Key): void => {
        if (key === 'save-file') saveFile.start();
        else if (key === 'remove-data') onRemoveData?.();
        else if (key === 'undo' || key === 'share' || key === 'remove' || key === 'remove-settings') setAsking(key);
    };
    const confirm = (): void => {
        setAsking(null);
        if (asking === 'undo') undo.start();
        else if (asking === 'share') sharing.start();
        else if (asking === 'remove') removal.start();
        else if (asking === 'remove-settings') layerRemoval.start();
    };

    // An inferred return type keeps the row assignable to Spectrum's Item collection type.
    const renderRow = (row: Row) => (
        <Item key={row.key} textValue={row.label}>
            {renderMenuIcon(row.icon)}
            <Text>{row.label}</Text>
        </Item>
    );
    const removing = removeRows(library && detail.mine === true, settingsLayer?.mine === true, onRemoveData !== undefined);
    return (
        <>
            {working ? (
                <div className="datapack-panel-loading">
                    <StageWait brief lines={workLines({ saveFile, undo, sharing, layerRemoval, shared: detail.shared })} />
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
                    {onImport ? (
                        <div className="db-drawer-actions">
                            {onSaveChanges ? (
                                // Outlined, as Install is beside it (owner, 2026-11-09, walk F124): whether
                                // anything changed is not known until a save reads the store, so it must
                                // not look like something waits to be saved.
                                <Button variant="secondary" onPress={onSaveChanges}>
                                    {saveAsNew ? 'Save As New Datapack' : 'Save Changes'}
                                </Button>
                            ) : null}
                            <MainButton
                                detail={detail}
                                outlined={onSaveChanges !== undefined}
                                onPress={() =>
                                    restores ? onImport(detail.id, 'restore') : onImport(detail.id)
                                }
                                restores={restores}
                            />
                            <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                                <Section key="pack">{packRows(detail, undoTo !== undefined).map(renderRow)}</Section>
                                {removing.length > 0 ? <Section key="remove">{removing.map(renderRow)}</Section> : null}
                            </CardActionsMenu>
                        </div>
                    ) : (
                        <LibraryActions detail={detail} removing={removing} onAction={onAction} renderRow={renderRow} />
                    )}
                    <PackActionNotes>
                        {saveFile.note}
                        {undo.note}
                        {sharing.note}
                        {removal.note}
                        {layerRemoval.note}
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

/** The main button: Restore on the demo's installed version (J4-2), else Install. */
function MainButton(p: { detail: DatapackDetail; outlined: boolean; restores: boolean; onPress: () => void }): React.JSX.Element {
    const label = p.restores ? `${RESTORE} ${p.detail.displayName}` : INSTALL;
    return <Button variant={p.outlined ? 'secondary' : 'accent'} onPress={p.onPress}>{label}</Button>;
}

/** The Datapack Library's actions: the menu's upper rows as buttons, and More only for what removes. */
function LibraryActions({
    detail,
    removing,
    onAction,
    renderRow,
}: {
    detail: DatapackDetail;
    removing: Row[];
    onAction: (key: React.Key) => void;
    renderRow: (row: Row) => React.JSX.Element;
}): React.JSX.Element {
    const sharable = detail.store === 'library' && detail.mine === true;
    return (
        <div className="db-drawer-actions">
            <Button variant="secondary" onPress={() => onAction('save-file')}>
                Save as File
            </Button>
            {sharable ? (
                <Button variant="secondary" onPress={() => onAction('share')}>
                    {detail.shared ? 'Stop Sharing' : 'Share'}
                </Button>
            ) : null}
            {removing.length > 0 ? (
                <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                    <Section key="remove">{removing.map(renderRow)}</Section>
                </CardActionsMenu>
            ) : null}
        </div>
    );
}

/** What the actions say, under them; nothing at all when none has anything to say. */
function PackActionNotes({ children }: { children: React.ReactNode }): React.JSX.Element | null {
    const said = React.Children.toArray(children);
    return said.length > 0 ? <div className="datapack-action-notes">{said}</div> : null;
}
