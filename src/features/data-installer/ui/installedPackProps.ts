/**
 * What the flyout of the installed version adds: Remove Data and Restore.
 *
 * Moved out of `DatapackCatalogView` (step-04 S1) to make room for the header's save button.
 *
 * @module features/data-installer/ui/installedPackProps
 */

import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/** Where the flyout stands: which view, what the project holds, and which version is open. */
export interface InstalledPackAt {
    library: boolean;
    held: ProjectDatapack | undefined;
    installedAt: string | undefined;
    selected: DatapackId | undefined;
}

/**
 * On the flyout of the version whose data Demo Builder installed in this demo's store: Remove Data
 * (owner, 2026-11-09, walk F118), and Restore in place of Install (Phase 5, J4-2), which needs that
 * install's record to take it out. Not in the Datapack Library, which touches no store.
 *
 * @param at - the view, the held datapack, its install record, and the open version
 * @param open - opens the job window on Remove Data
 * @returns the flyout's extra props, or none
 */
export function installedPackProps(at: InstalledPackAt, open: () => void): { onRemoveData?: () => void; restores?: true } {
    const { library, held, installedAt, selected } = at;
    const shown = held !== undefined && selected !== undefined && held.name === selected.name && held.version === selected.version;
    return !library && installedAt !== undefined && shown ? { onRemoveData: open, restores: true } : {};
}
