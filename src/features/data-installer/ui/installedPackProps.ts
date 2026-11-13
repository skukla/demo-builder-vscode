/**
 * What the flyout's main button is, by where it stands: Restore and Uninstall on the installed
 * version, Switch to on another datapack over it.
 *
 * Moved out of `DatapackCatalogView` (step-04 S1) to make room for the header's save button.
 *
 * @module features/data-installer/ui/installedPackProps
 */

import { windowRoute } from './hooks/useImportWindow';
import type { HeldFailure } from './hooks/useProjectHolding';
import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/** Where the flyout stands: which view, what the project holds, and which version is open. */
export interface InstalledPackAt {
    library: boolean;
    held: ProjectDatapack | undefined;
    installedAt: string | undefined;
    selected: DatapackId | undefined;
    /** A failed install of `held` (step-04 S8). */
    failed?: HeldFailure;
}

/** The flyout's extra props. */
export interface InstalledPackProps {
    onRemoveData?: () => void;
    restores?: true;
    switches?: true;
    /** The held version's install failed: Retry or Fix with AI in place of the main button (S8). */
    failed?: HeldFailure;
}

/**
 * On the flyout of the version whose data Demo Builder installed in this demo's store: Uninstall
 * (owner, 2026-11-09, walk F118), and Restore in place of Install (Phase 5, J4-2), which needs that
 * install's record to take it out. On another datapack over that one: Switch to in place of Install
 * (J8-1, owner 2026-11-12), exactly when the job window opens on a switch (`windowRoute`), so the
 * button never names a job the window will not run. Not in the Datapack Library, which touches no
 * store. On the held version whose install failed: failed, in place of Restore (step-04 S8, J6-2),
 * keeping Uninstall while that install left a record of what it put in.
 *
 * @param at - the view, the held datapack, its install record, and the open version
 * @param open - opens the job window on Uninstall
 * @returns the flyout's extra props, or none
 */
export function installedPackProps(
    at: InstalledPackAt,
    open: () => void,
): InstalledPackProps {
    const { library, held, installedAt, selected, failed } = at;
    if (library || held === undefined || selected === undefined) return {};
    const heldVersion = held.name === selected.name && held.version === selected.version;
    if (heldVersion && failed) return { failed, ...(installedAt === undefined ? {} : { onRemoveData: open }) };
    if (installedAt === undefined) return {};
    if (heldVersion) return { onRemoveData: open, restores: true };
    return windowRoute({ id: selected, holding: { pack: held, recorded: true } }) === 'switch' ? { switches: true } : {};
}
