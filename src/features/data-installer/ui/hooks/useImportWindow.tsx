/**
 * Which import window is open, fixed at the moment it opened (owner, 2026-11-09, walk F113): the
 * pack and version, the name it shows, the data types when the flyout already read them, and
 * whether it opened on Remove Data (F118).
 *
 * It was mounted only while the flyout showed the version being imported, so a save that moved the
 * project onto a new version moved the flyout, and the window closed a second into the import; and
 * Restore Version moved the flyout first, a pause with nothing on screen (F107). Now nothing the
 * flyout does closes the window: the window reads its own version's data types when the flyout has
 * not (`useVersionTypes`).
 *
 * @module features/data-installer/ui/hooks/useImportWindow
 */

import React, { useCallback, useState } from 'react';
import type { DataItemInventory, DatapackDetail } from '../../types';
import { ImportDatapackModal } from '../components/ImportDatapackModal';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What the window opened on. */
export interface ImportWindow {
    id: DatapackId;
    store: DatapackStoreName;
    displayName: string;
    /** The data types the version holds, when the flyout had read that version; else the window reads them. */
    types?: string[];
    /** Opened by Remove Data: straight to the removal's confirm, closing when it is done (F118). */
    opensOn?: 'remove';
}

/** The flyout's read: the detail and what is stored, as `get-datapack-detail` answers. */
interface ShownDetail {
    detail: DatapackDetail;
    inventory: DataItemInventory;
}

/**
 * @param shown - what the flyout shows now
 * @param store - the store the flyout's pack is in
 */
export function useImportWindow(
    shown: ShownDetail | null,
    store: DatapackStoreName,
): {
    window: ImportWindow | undefined;
    open: (id: DatapackId) => void;
    openRemoval: () => void;
    close: () => void;
} {
    const [opened, setOpened] = useState<ImportWindow | undefined>(undefined);
    const open = useCallback(
        (id: DatapackId): void => {
            if (!shown) return;
            const same = shown.detail.id.version === id.version;
            setOpened({
                id,
                store,
                displayName: shown.detail.displayName,
                ...(same ? { types: shown.inventory.present } : {}),
            });
        },
        [shown, store],
    );
    const openRemoval = useCallback((): void => {
        if (!shown) return;
        setOpened({
            id: shown.detail.id,
            store,
            displayName: shown.detail.displayName,
            types: shown.inventory.present,
            opensOn: 'remove',
        });
    }, [shown, store]);
    const close = useCallback((): void => setOpened(undefined), []);
    return { window: opened, open, openRemoval, close };
}

/** The import window as it opened (`useImportWindow`): only what it was given goes in. */
export function ImportWindowModal({ opened, onClose }: { opened: ImportWindow; onClose: () => void }): React.JSX.Element {
    return (
        <ImportDatapackModal
            id={opened.id}
            displayName={opened.displayName}
            {...(opened.types ? { availableTypes: opened.types } : {})}
            source={opened.store}
            {...(opened.opensOn ? { opensOn: opened.opensOn } : {})}
            onClose={onClose}
        />
    );
}
