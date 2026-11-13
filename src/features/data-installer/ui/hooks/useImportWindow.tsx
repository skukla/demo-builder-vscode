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
 * window (`DatapackJobWindow`) for a first install (S4), a switch over another datapack (S6) and a
 * run already started (Undo, Restore), and `ImportDatapackModal` for another version of the held
 * datapack and Uninstall.
 *
 * @module features/data-installer/ui/hooks/useImportWindow
 */

import React, { useCallback, useState } from 'react';
import type { DataItemInventory, DatapackDetail, DatapackSummary } from '../../types';
import { ImportDatapackModal } from '../components/ImportDatapackModal';
import { DatapackJobWindow } from '../components/job/DatapackJobWindow';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** The datapack the project holds, and whether Demo Builder installed it (so can uninstall it). */
export interface Holding {
    pack: ProjectDatapack;
    recorded: boolean;
}

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
    /** The datapack the project held when the window opened: installing another is a switch. */
    holding?: Holding;
    /** The names of the SC's own datapacks: a new one's name may not be one of them. */
    ownNames: string[];
}

/** The window a job opens in: the job window, by its kind, or today's window. */
export type WindowRoute = 'install' | 'switch' | 'watch' | 'modal';

/**
 * Which window opens (step 03, S4 and S6): the job window for a first install, for a switch over
 * another datapack Demo Builder installed (with no record there is nothing to uninstall, so it is
 * an install), and for a run already started; today's window for what later slices move (another
 * version of the held datapack, Uninstall).
 */
export function windowRoute(opened: Pick<ImportWindow, 'id' | 'opensOn' | 'holding'>): WindowRoute {
    if (opened.opensOn === 'run') return 'watch';
    if (opened.opensOn === 'remove') return 'modal';
    const { holding } = opened;
    if (!holding) return 'install';
    if (holding.pack.name === opened.id.name) return 'modal';
    return holding.recorded ? 'switch' : 'install';
}

/** The flyout's read: the detail and what is stored, as `get-datapack-detail` answers. */
interface ShownDetail {
    detail: DatapackDetail;
    inventory: DataItemInventory;
}

/** What the project holds and what the SC owns, as the window opens on them. */
export interface Owned {
    holding?: Holding;
    ownNames: string[];
}

/**
 * What the window opens on (step 03, S6): the datapack the project holds, whether Demo Builder
 * installed it, and the names of the SC's own datapacks, which a new one may not take.
 */
export function ownedOf(
    page: { items: readonly DatapackSummary[] } | null,
    held: ProjectDatapack | undefined,
    installedAt: string | undefined,
): Owned {
    const ownNames = (page?.items ?? []).filter((item) => item.mine === true).map((item) => item.displayName);
    const recorded = installedAt !== undefined;
    return { ...(held ? { holding: { pack: held, recorded } } : {}), ownNames };
}

/**
 * @param shown - what the flyout shows now
 * @param store - the store the flyout's pack is in
 * @param owned - the datapack the open project holds, and the SC's own datapacks' names
 */
export function useImportWindow(
    shown: ShownDetail | null,
    store: DatapackStoreName,
    owned: Owned,
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
                ...owned,
            });
        },
        [shown, store, owned],
    );
    const openRemoval = useCallback((): void => {
        if (!shown) return;
        setOpened({
            id: shown.detail.id,
            store,
            displayName: shown.detail.displayName,
            types: shown.inventory.present,
            opensOn: 'remove',
            ...owned,
        });
    }, [shown, store, owned]);
    const close = useCallback((): void => setOpened(undefined), []);
    return { window: opened, open, openRemoval, close };
}

/** The import window as it opened (`useImportWindow`): only what it was given goes in. */
export function ImportWindowModal({ opened, onClose }: { opened: ImportWindow; onClose: () => void }): React.JSX.Element {
    const route = windowRoute(opened);
    if (route !== 'modal') {
        return (
            <DatapackJobWindow
                id={opened.id}
                displayName={opened.displayName}
                {...(opened.types ? { types: opened.types } : {})}
                source={opened.store}
                startsAt={route === 'watch' ? 'run' : 'check'}
                {...(route === 'switch' ? { switching: { ownNames: opened.ownNames } } : {})}
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
