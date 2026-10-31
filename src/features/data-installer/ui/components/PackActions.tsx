/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view, and everything else
 * is behind a "More" button (`CardActionsMenu` with a label, owner 2026-10-31: a bare ⋯ beside
 * Import read as unclear; icons from `renderMenuIcon`), where it was five buttons
 * on three rows. In the menu, in order: Save as file; Save store changes to this pack, for the
 * pack the open project holds by Demo Builder's engine; Share or Stop sharing, on the SC's own
 * library pack; and Remove from library, the same pack only, in its own section at the bottom.
 *
 * Every action keeps the condition and confirmation it had as a button. Share and Stop sharing
 * ask before they change anything (`ShareLibraryPackConfirm`); Remove asks only when the pack was
 * shared in a project file, with the warning `get-datapack-detail` carries, else removes on the
 * one choice, as the button did. What each one says afterwards (where the file went, that the
 * pack was removed, why not) shows under the actions.
 *
 * By store: a Data Installer pack offers Import. A library pack offers Import when Demo Builder's
 * engine is chosen (it reads the library itself), else Copy to the Data Installer, above, which
 * offers Import once the copy lands (the service installs only from its own catalog).
 *
 * @module features/data-installer/ui/components/PackActions
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import type { DatapackDetail } from '../../types';
import { CopyToInstallerButton } from './CopyToInstallerButton';
import { useLibraryRemoval } from './RemoveFromLibraryButton';
import { useSaveDatapackFile } from './SaveDatapackFileButton';
import { ShareLibraryPackConfirm } from './ShareLibraryPackConfirm';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import type { DatapackId } from '@/types/datapack';

export interface PackActionsProps {
    detail: DatapackDetail;
    onImport: (id: DatapackId) => void;
    /** A library pack the SC owned was removed. Stable — an effect depends on it. */
    onRemoved: () => void;
    /** Demo Builder's engine is chosen, which installs a library pack where it is. */
    installsFromLibrary: boolean;
    /** "Save store changes to this pack": only for the pack the project holds by Demo Builder's engine. */
    onSaveStoreChanges?: (id: DatapackId) => void;
    /** The warning a delete carries when this SC shared the pack in a project file. */
    sharedInFile?: string;
    /** The SC's own pack was shared or stopped being shared. Stable. */
    onSharingChanged?: () => void;
}

/** One menu row: its icon and label. */
interface Row {
    key: string;
    label: string;
    icon: string;
}

/** The menu's upper section: what any pack offers, then what the SC's own library pack adds. */
function packRows(detail: DatapackDetail, saveStore: boolean): Row[] {
    const rows: Row[] = [{ key: 'save-file', label: 'Save as file', icon: 'saveFile' }];
    if (saveStore) rows.push({ key: 'save-store', label: 'Save store changes to this pack', icon: 'capture' });
    if (detail.store === 'library' && detail.mine) {
        rows.push({ key: 'share', label: detail.shared ? 'Stop sharing' : 'Share', icon: 'share' });
    }
    return rows;
}

/** The inline confirm open under the actions, if any. */
type Asking = 'share' | 'remove' | null;

export function PackActions({
    detail,
    onImport,
    onRemoved,
    installsFromLibrary,
    onSaveStoreChanges,
    sharedInFile,
    onSharingChanged,
}: PackActionsProps): React.JSX.Element {
    const library = detail.store === 'library';
    const [asking, setAsking] = useState<Asking>(null);
    const saveFile = useSaveDatapackFile(detail.id, library ? 'library' : 'installer');
    const removal = useLibraryRemoval(detail.id, onRemoved);
    const doneAsking = useCallback((): void => setAsking(null), []);

    const onAction = (key: React.Key): void => {
        if (key === 'save-file') saveFile.start();
        else if (key === 'save-store') onSaveStoreChanges?.(detail.id);
        else if (key === 'share') setAsking('share');
        else if (key === 'remove') {
            if (sharedInFile) setAsking('remove');
            else removal.start();
        }
    };
    const confirmRemove = (): void => {
        setAsking(null);
        removal.start();
    };

    // An inferred return type keeps the row assignable to Spectrum's Item collection type.
    const renderRow = (row: Row) => (
        <Item key={row.key} textValue={row.label}>
            {renderMenuIcon(row.icon)}
            <Text>{row.label}</Text>
        </Item>
    );
    const showImport = !library || installsFromLibrary;
    return (
        <>
            {library && !installsFromLibrary ? <CopyToInstallerButton id={detail.id} onImport={onImport} /> : null}
            <div className="db-drawer-actions">
                {showImport ? (
                    <Button variant="accent" onPress={() => onImport(detail.id)}>
                        Import
                    </Button>
                ) : null}
                <CardActionsMenu label="More" ariaLabel={`More actions for ${detail.displayName}`} onAction={onAction}>
                    <Section key="pack">{packRows(detail, onSaveStoreChanges !== undefined).map(renderRow)}</Section>
                    {library && detail.mine ? (
                        <Section key="remove">
                            <Item key="remove" textValue="Remove from library">
                                {renderMenuIcon('delete')}
                                <Text>Remove from library</Text>
                            </Item>
                        </Section>
                    ) : null}
                </CardActionsMenu>
            </div>
            <PackActionNotes>
                {saveFile.note}
                {asking === 'share' ? (
                    <ShareLibraryPackConfirm id={detail.id} shared={detail.shared} onChanged={onSharingChanged} onDone={doneAsking} />
                ) : null}
                {asking === 'remove' && sharedInFile ? (
                    <RemoveConfirm warning={sharedInFile} onRemove={confirmRemove} onCancel={doneAsking} />
                ) : null}
                {removal.note}
            </PackActionNotes>
        </>
    );
}

/** What the actions say, under them; nothing at all when none has anything to say. */
function PackActionNotes({ children }: { children: React.ReactNode }): React.JSX.Element | null {
    const said = React.Children.toArray(children);
    return said.length > 0 ? <div className="datapack-action-notes">{said}</div> : null;
}

/** Remove's warning for a pack shared in a project file: Remove does it, Cancel keeps it. */
function RemoveConfirm({ warning, onRemove, onCancel }: { warning: string; onRemove: () => void; onCancel: () => void }): React.JSX.Element {
    return (
        <div className="datapack-save-file">
            <p className="datapack-export-note">{warning}</p>
            <Button variant="negative" onPress={onRemove}>
                Remove
            </Button>
            <Button variant="secondary" onPress={onCancel}>
                Cancel
            </Button>
        </div>
    );
}
