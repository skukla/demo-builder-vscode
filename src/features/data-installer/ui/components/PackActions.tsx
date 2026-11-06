/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view, and everything else
 * is behind a "More" button (`CardActionsMenu` with a label, owner 2026-10-31: a bare ⋯ beside
 * Import read as unclear; icons from `renderMenuIcon`), where it was five buttons
 * on three rows. In the menu, in order: Save as file; Share or Stop sharing, on the SC's own
 * library pack; and Remove from library, the same pack only, in its own section at the bottom.
 * The demo's own pack, when it is the SC's, leads with Save Changes, which writes what its store now
 * holds as a new version, with Import beside it (owner, 2026-11-04); a new pack is the header's
 * Create Datapack.
 * A pack whose settings layer is the SC's own also offers "Remove its store settings" there, since a
 * layer has no card of its own to remove it from (datapack-engine step 09).
 *
 * **Share, Stop sharing and both removes ask in a dialog** (`ConfirmActionDialog`, owner,
 * 2026-11-05). Remove used to ask only when the pack was shared in a project file, though it cannot
 * be undone either way. **While a menu row's work runs, the flyout waits**: its title and the medium
 * spinner its load shows, nothing else (dialog design rules), since the menu has closed and has no
 * button to spin. What each one says afterwards (where the file went, why it could not) shows under
 * the actions.
 *
 * Every pack offers Import: Demo Builder installs a library pack and a Data Installer pack alike.
 * A library pack also offers Copy to the Data Installer, above, while the Data Installer is on:
 * it puts the pack in the catalog other teams share (owner, 2026-11-06), and is not needed to
 * install it here.
 *
 * @module features/data-installer/ui/components/PackActions
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { SHARE_CONSENT } from '../../shareWording';
import type { DatapackDetail, PackDetailLayer } from '../../types';
import { useLibrarySharing } from '../hooks/useLibrarySharing';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { ConfirmActionDialog, type ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import type { DatapackId } from '@/types/datapack';

export interface PackActionsProps {
    detail: DatapackDetail;
    onImport: (id: DatapackId) => void;
    /** Save Changes: given only for the demo's own pack when it is the SC's. */
    onSaveChanges?: () => void;
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
}

/** One menu row: its icon and label. */
interface Row {
    key: string;
    label: string;
    icon: string;
}

/** The menu's upper section: what any pack offers, then what the SC's own library pack adds. */
function packRows(detail: DatapackDetail): Row[] {
    const rows: Row[] = [{ key: 'save-file', label: 'Save as File', icon: 'saveFile' }];
    if (detail.store === 'library' && detail.mine) {
        rows.push({ key: 'share', label: detail.shared ? 'Stop Sharing' : 'Share', icon: 'share' });
    }
    return rows;
}

/** The menu's lower section: what removes something from the library. */
function removeRows(ownPack: boolean, ownLayer: boolean): Row[] {
    return [
        ...(ownPack ? [{ key: 'remove', label: 'Remove Datapack', icon: 'delete' }] : []),
        ...(ownLayer ? [{ key: 'remove-settings', label: 'Remove Its Store Settings', icon: 'delete' }] : []),
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
            title: `Remove ${name}'s Store Settings?`,
            actionLabel: 'Remove',
            actionVariant: 'negative',
            children: "This removes the store settings saved with it, and it can't be undone.",
        };
    }
    return {
        title: `Remove ${name}?`,
        actionLabel: 'Remove',
        actionVariant: 'negative',
        children: [`This removes version ${detail.id.version}, and it can't be undone.`, sharedInFile],
    };
}

export function PackActions({
    detail,
    onImport,
    onSaveChanges,
    onRemoved,
    installerOn,
    sharedInFile,
    onSharingChanged,
    settingsLayer,
    onWorking,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved);
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
    const removing = removeRows(library && detail.mine === true, settingsLayer?.mine === true);
    return (
        <>
            {working ? (
                <div className="datapack-panel-loading">
                    <LoadingDisplay size="M" centered message="" />
                </div>
            ) : null}
            {/* Kept mounted through a wait: a copy's own result would be lost with it. */}
            {library && installerOn ? (
                <div hidden={working}>
                    <CopyToInstallerButton id={detail.id} />
                </div>
            ) : null}
            {working ? null : (
                <>
                    <div className="db-drawer-actions">
                        {onSaveChanges ? (
                            <Button variant="accent" onPress={onSaveChanges}>
                                Save Changes
                            </Button>
                        ) : null}
                        <Button variant={onSaveChanges ? 'secondary' : 'accent'} onPress={() => onImport(detail.id)}>
                            Import
                        </Button>
                        <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                            <Section key="pack">{packRows(detail).map(renderRow)}</Section>
                            {removing.length > 0 ? <Section key="remove">{removing.map(renderRow)}</Section> : null}
                        </CardActionsMenu>
                    </div>
                    <PackActionNotes>
                        {saveFile.note}
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

/** What the actions say, under them; nothing at all when none has anything to say. */
function PackActionNotes({ children }: { children: React.ReactNode }): React.JSX.Element | null {
    const said = React.Children.toArray(children);
    return said.length > 0 ? <div className="datapack-action-notes">{said}</div> : null;
}
