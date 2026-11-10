/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view, and everything else
 * is behind a "More" button (`CardActionsMenu` with a label, owner 2026-10-31: a bare ⋯ beside
 * Import read as unclear; icons from `renderMenuIcon`), where it was five buttons
 * on three rows. In the menu, in order: Save as file; Version History, on a pack of saves with more
 * than one (walk F99: its earlier saves, one to restore); Share or Stop sharing, on the SC's own
 * library pack; and Delete Datapack, the same pack only, in its own section at the bottom. A pack of
 * saves is deleted whole.
 * The demo's own pack, when it is the SC's, leads with Save Changes, which writes what its store now
 * holds as a new version, with Import beside it (owner, 2026-11-04); a new pack is the header's
 * Create Datapack.
 * A pack whose settings layer is the SC's own also offers "Delete Store Configuration" there, since a
 * layer has no card of its own to remove it from (datapack-engine step 09).
 *
 * **Share, Stop sharing and both removes ask in a dialog** (`ConfirmActionDialog`, owner,
 * 2026-11-05). Remove used to ask only when the pack was shared in a project file, though it cannot
 * be undone either way. **While a menu row's work runs, the flyout waits**: its title and the medium
 * spinner its load shows, nothing else (dialog design rules), since the menu has closed and has no
 * button to spin. What each one says afterwards (where the file went, why it could not) shows under
 * the actions.
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
import { INSTALL } from '../../datapackWords';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { isSavedVersion } from '../../packVersions';
import { SHARE_CONSENT } from '../../shareWording';
import type { DatapackDetail, PackDetailLayer } from '../../types';
import { useLibrarySharing } from '../hooks/useLibrarySharing';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { ConfirmActionDialog, type ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId } from '@/types/datapack';

const NO_HISTORY: readonly string[] = [];

export interface PackActionsProps {
    detail: DatapackDetail;
    /** Import: absent in the Datapack Library. */
    onImport?: (id: DatapackId) => void;
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
    /** The pack's saves, newest first: with more than one, More offers Version History (walk F99). */
    history?: readonly string[];
    /** The save this demo uses, for Version History's In Use. */
    inUse?: string;
    /** Remove Data: on the version whose data is in this demo's store, opening straight to its confirm (F118). */
    onRemoveData?: () => void;
}

/** One menu row: its icon and label. */
interface Row {
    key: string;
    label: string;
    icon: string;
}

/** The menu's upper section: what any pack offers, then what the SC's own library pack adds. */
function packRows(detail: DatapackDetail, withHistory: boolean): Row[] {
    const rows: Row[] = [{ key: 'save-file', label: 'Save as File', icon: 'saveFile' }];
    if (withHistory) rows.push({ key: 'history', label: 'Version History', icon: 'history' });
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
type Asking = 'share' | 'remove' | 'remove-settings' | null;

type ConfirmCopy = Pick<ConfirmActionDialogProps, 'title' | 'actionLabel' | 'actionVariant' | 'children'>;

/** What a dialog asks. The title of a closed one is never drawn. */
function confirmCopy(asking: Asking, detail: DatapackDetail, sharedInFile?: string): ConfirmCopy {
    const name = detail.displayName;
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
    // A pack of saves goes whole, its Version History with it (owner, 2026-11-09).
    const what = isSavedVersion(detail.id.version) ? 'it and its version history' : `version ${detail.id.version}`;
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
    sharing: { working: boolean };
    layerRemoval: { removing: boolean };
    shared?: boolean;
}): WaitLines {
    if (work.saveFile.saving) return WAIT_STAGES.savingPackFile;
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
    history = NO_HISTORY,
    inUse,
    onRemoveData,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const [showHistory, setShowHistory] = useState(false);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved, isSavedVersion(detail.id.version));
    const layerRemoval = useLibraryRemoval(settingsLayer?.id ?? detail.id, onSharingChanged);
    const sharing = useLibrarySharing(detail.id, detail.shared, onSharingChanged);
    const doneAsking = useCallback((): void => setAsking(null), []);
    // Still waiting once the pack is gone, as the flyout closes: its rows must not flash back.
    const working =
        saveFile.saving || sharing.working || removal.removing || removal.removed || layerRemoval.removing;

    // Before the paint, or the flyout's rows would show for a frame beside the spinner. The cleanup is
    // for a flyout closed during the wait, which unmounts this with the work still running.
    useLayoutEffect(() => {
        onWorking?.(working);
        return () => onWorking?.(false);
    }, [working, onWorking]);

    const onAction = (key: React.Key): void => {
        if (key === 'save-file') saveFile.start();
        else if (key === 'history') setShowHistory(true);
        else if (key === 'remove-data') onRemoveData?.();
        else if (key === 'share' || key === 'remove' || key === 'remove-settings') setAsking(key);
    };
    const confirm = (): void => {
        setAsking(null);
        if (asking === 'share') sharing.start();
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
                    <StageWait brief lines={workLines({ saveFile, sharing, layerRemoval, shared: detail.shared })} />
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
                            <Button variant={onSaveChanges ? 'secondary' : 'accent'} onPress={() => onImport(detail.id)}>
                                {INSTALL}
                            </Button>
                            <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                                <Section key="pack">{packRows(detail, history.length > 1).map(renderRow)}</Section>
                                {removing.length > 0 ? <Section key="remove">{removing.map(renderRow)}</Section> : null}
                            </CardActionsMenu>
                        </div>
                    ) : (
                        <LibraryActions detail={detail} removing={removing} onAction={onAction} renderRow={renderRow} />
                    )}
                    <PackActionNotes>
                        {saveFile.note}
                        {sharing.note}
                        {removal.note}
                        {layerRemoval.note}
                    </PackActionNotes>
                </>
            )}
            {onImport ? (
                <VersionHistoryDialog
                    isOpen={showHistory}
                    versions={history}
                    {...(inUse ? { inUse } : {})}
                    onRestore={(version) => {
                        setShowHistory(false);
                        onImport({ name: detail.id.name, version });
                    }}
                    onClose={() => setShowHistory(false)}
                />
            ) : null}
            <ConfirmActionDialog
                isOpen={asking !== null}
                {...confirmCopy(asking, detail, sharedInFile)}
                onConfirm={confirm}
                onClose={doneAsking}
            />
        </>
    );
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
