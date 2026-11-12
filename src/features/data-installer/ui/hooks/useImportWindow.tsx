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
 * Two windows serve it while step 03 moves the paths one slice at a time (`windowRoute`): the job
 * window (`DatapackJobWindow`, S4) for a first install and for a run already started (Undo,
 * Restore), and `ImportDatapackModal` for a switch, a held pack's reinstall and Uninstall.
 *
 * @module features/data-installer/ui/hooks/useImportWindow
 */

import React, { useCallback, useState } from 'react';
import type { DataItemInventory, DatapackDetail } from '../../types';
import { ImportDatapackModal } from '../components/ImportDatapackModal';
import { DatapackJobWindow } from '../components/job/DatapackJobWindow';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What the window opened on. */
export interface ImportWindow {
    id: DatapackId;
    store: DatapackStoreName;
    displayName: string;
    /** The data types the version holds, when the flyout had read that version; else the window reads them. */
    types?: string[];
    /**
     * Opened by Remove Data: straight to the removal's confirm, closing when it is done (F118). Opened
     * by Undo or Restore once its job was accepted: straight to the run.
     */
    opensOn?: 'remove' | 'run';
    /** The project held a datapack when the window opened: installing another is a switch. */
    holdsAPack: boolean;
}

/**
 * Which window opens (step 03, S4): the job window for a first install, the project holding no
 * datapack, and for a run already started; today's window for everything later slices move (a
 * switch over the held pack, its reinstall, Uninstall).
 */
export function windowRoute(opened: Pick<ImportWindow, 'opensOn' | 'holdsAPack'>): 'job' | 'modal' {
    if (opened.opensOn === 'run') return 'job';
    if (opened.opensOn === 'remove') return 'modal';
    return opened.holdsAPack ? 'modal' : 'job';
}

/** The flyout's read: the detail and what is stored, as `get-datapack-detail` answers. */
interface ShownDetail {
    detail: DatapackDetail;
    inventory: DataItemInventory;
}

/**
 * @param shown - what the flyout shows now
 * @param store - the store the flyout's pack is in
 * @param holdsAPack - the open project holds a datapack
 */
export function useImportWindow(
    shown: ShownDetail | null,
    store: DatapackStoreName,
    holdsAPack: boolean,
): {
    window: ImportWindow | undefined;
    open: (id: DatapackId, opensOn?: 'run') => void;
    openRemoval: () => void;
    close: () => void;
} {
    const [opened, setOpened] = useState<ImportWindow | undefined>(undefined);
    const open = useCallback(
        (id: DatapackId, opensOn?: 'run'): void => {
            if (!shown) return;
            const same = shown.detail.id.version === id.version;
            setOpened({
                id,
                store,
                displayName: shown.detail.displayName,
                ...(same ? { types: shown.inventory.present } : {}),
                ...(opensOn ? { opensOn } : {}),
                holdsAPack,
            });
        },
        [shown, store, holdsAPack],
    );
    const openRemoval = useCallback((): void => {
        if (!shown) return;
        setOpened({
            id: shown.detail.id,
            store,
            displayName: shown.detail.displayName,
            types: shown.inventory.present,
            opensOn: 'remove',
            holdsAPack,
        });
    }, [shown, store, holdsAPack]);
    const close = useCallback((): void => setOpened(undefined), []);
    return { window: opened, open, openRemoval, close };
}

/** The import window as it opened (`useImportWindow`): only what it was given goes in. */
export function ImportWindowModal({ opened, onClose }: { opened: ImportWindow; onClose: () => void }): React.JSX.Element {
    if (windowRoute(opened) === 'job') {
        return (
            <DatapackJobWindow
                id={opened.id}
                displayName={opened.displayName}
                {...(opened.types ? { types: opened.types } : {})}
                source={opened.store}
                startsAt={opened.opensOn === 'run' ? 'run' : 'check'}
                onClose={onClose}
            />
        );
    }
    const opensOn = opened.opensOn === 'remove' ? opened.opensOn : undefined;
    return (
        <ImportDatapackModal
            id={opened.id}
            displayName={opened.displayName}
            {...(opened.types ? { availableTypes: opened.types } : {})}
            source={opened.store}
            {...(opensOn ? { opensOn } : {})}
            onClose={onClose}
        />
    );
}
