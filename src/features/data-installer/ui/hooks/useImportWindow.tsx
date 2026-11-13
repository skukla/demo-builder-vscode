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
 * One window serves every path (`DatapackJobWindow`, step 03), on the job `windowRoute` picks: a
 * first install (S4), a switch over another datapack (S6), Uninstall and another version of the held
 * datapack (S7), and a run already started (Undo, Restore).
 *
 * @module features/data-installer/ui/hooks/useImportWindow
 */

import React, { useCallback, useState } from 'react';
import type { DataItemInventory, DatapackDetail, DatapackSummary } from '../../types';
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
     * Opened by Uninstall: the uninstall's check, then its question (F118, J5-1). Opened by Undo or
     * Restore once its job was accepted: straight to the run.
     */
    opensOn?: 'remove' | 'run';
    /** The datapack the project held when the window opened: installing another is a switch. */
    holding?: Holding;
    /** The names of the SC's own datapacks: a new one's name may not be one of them. */
    ownNames: string[];
}

/** The job the window opens on. */
export type WindowRoute = 'install' | 'switch' | 'version' | 'uninstall' | 'watch';

/**
 * Which job the window opens on (step 03, S4, S6, S7). With no record of the held datapack there is
 * nothing to uninstall it by, so installing over it is an install. Another version of the held
 * datapack is a switch in Install's words (`version`). The same version again installs in place,
 * replacing nothing, as the handler does (`importReplacement.ts`); on screen it is reached only
 * when there is no record, since Restore stands in Install's place otherwise (`installedPackProps`).
 */
export function windowRoute(opened: Pick<ImportWindow, 'id' | 'opensOn' | 'holding'>): WindowRoute {
    if (opened.opensOn === 'run') return 'watch';
    if (opened.opensOn === 'remove') return 'uninstall';
    const { holding } = opened;
    if (!holding?.recorded) return 'install';
    if (holding.pack.name !== opened.id.name) return 'switch';
    return holding.pack.version === opened.id.version ? 'install' : 'version';
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

/** The props each route adds to the job window. */
function routeProps(route: WindowRoute, ownNames: string[]): Partial<React.ComponentProps<typeof DatapackJobWindow>> {
    if (route === 'uninstall') return { uninstalling: { ownNames } };
    if (route === 'switch') return { switching: { ownNames } };
    if (route === 'version') return { switching: { ownNames, verb: 'Install' } };
    return {};
}

/** The import window as it opened (`useImportWindow`): only what it was given goes in. */
export function ImportWindowModal({ opened, onClose }: { opened: ImportWindow; onClose: () => void }): React.JSX.Element {
    const route = windowRoute(opened);
    return (
        <DatapackJobWindow
            id={opened.id}
            displayName={opened.displayName}
            {...(opened.types ? { types: opened.types } : {})}
            source={opened.store}
            startsAt={route === 'watch' ? 'run' : 'check'}
            {...routeProps(route, opened.ownNames)}
            onClose={onClose}
        />
    );
}
