/**
 * The data types the import window's version holds: the ones it was opened with, or read here when
 * it was opened on a version the flyout has not read, as Restore Version does (owner, 2026-11-09,
 * walk F107, F113). The window then waits on its own spinner rather than the screen showing nothing
 * while the flyout reads, and nothing the flyout does closes it.
 *
 * @module features/data-installer/ui/hooks/useVersionTypes
 */

import { useEffect, useMemo } from 'react';
import type { DataItemInventory } from '../../types';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** One empty list for every render: a new `[]` each time would re-run whatever depends on it. */
const NONE: string[] = [];

/**
 * @param id - the version imported
 * @param store - the store holding it
 * @param given - its data types, when whoever opened the window had them
 * @returns the types (stable across renders) and whether they are still being read
 */
export function useVersionTypes(
    id: DatapackId,
    store: DatapackStoreName | undefined,
    given: string[] | undefined,
): { types: string[]; reading: boolean } {
    const detail = useDataInstallerRequest<{ inventory: DataItemInventory }>('get-datapack-detail');
    const load = detail.load;
    const needed = given === undefined;
    useEffect(() => {
        if (needed)
            load({ datapackName: id.name, version: id.version, ...(store ? { store } : {}) });
    }, [needed, load, id.name, id.version, store]);
    const read = detail.value?.inventory.present;
    const types = useMemo(() => given ?? read ?? NONE, [given, read]);
    return { types, reading: needed && !detail.settled };
}
