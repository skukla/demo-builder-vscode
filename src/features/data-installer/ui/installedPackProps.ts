/**
 * What the flyout's main button is, by where it stands: Update or Restore, and Uninstall, on the
 * installed version, Switch to on another datapack over it.
 *
 * Moved out of `DatapackCatalogView` (step-04 S1) to make room for the header's save button.
 *
 * @module features/data-installer/ui/installedPackProps
 */

import { windowRoute } from './hooks/useImportWindow';
import type { HeldFailure } from './hooks/useProjectHolding';
import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/**
 * Saving the demo's datapack, from its own flyout (owner, 2026-11-17, walk F219): Update into the
 * SC's own datapack, naming it, and Save As New. Someone else's offers Save As New alone.
 */
export interface HeldSaves {
    onUpdate?: () => void;
    onSaveAsNew: () => void;
    /** The datapack Update writes into, by name: its row says so. */
    into?: string;
}

/** Where the flyout stands: which view, what the project holds, and which version is open. */
export interface InstalledPackAt {
    library: boolean;
    held: ProjectDatapack | undefined;
    installedAt: string | undefined;
    selected: DatapackId | undefined;
    /** A failed install of `held` (step-04 S8). */
    failed?: HeldFailure;
    /** Update is waiting on `held` (`updateWaiting`): a newer version, or types left behind (J9-1). */
    updatable?: boolean;
    /** The saves the held version's flyout offers (F219). */
    saves?: HeldSaves;
}

/** The flyout's extra props. */
export interface InstalledPackProps {
    onRemoveData?: () => void;
    restores?: true;
    /** Update in place of Restore (J9-1: "Update means apply what changed"). */
    updates?: true;
    switches?: true;
    /** The held version's install failed: Retry or Fix with AI in place of the main button (S8). */
    failed?: HeldFailure;
    /** Update and Save As New, on the version Demo Builder installed (F219). */
    saves?: HeldSaves;
}

/**
 * On the flyout of the version whose data Demo Builder installed in this demo's store: Uninstall
 * (owner, 2026-11-09, walk F118), and Restore in place of Install (Phase 5, J4-2), which needs that
 * install's record to take it out; Update in place of Restore while an update waits (J9-1). On another datapack over that one: Switch to in place of Install
 * (J8-1, owner 2026-11-12), exactly when the job window opens on a switch (`windowRoute`), so the
 * button never names a job the window will not run. Not in the Datapack Library, which touches no
 * store. On the held version whose install failed: failed, in place of Restore (step-04 S8, J6-2),
 * keeping Uninstall while that install left a record of what it put in. The installed version's
 * flyout also offers its saves (walk F219): the header keeps only what is about no one datapack.
 *
 * @param at - the view, the held datapack, its install record, and the open version
 * @param open - opens the job window on Uninstall
 * @returns the flyout's extra props, or none
 */
export function installedPackProps(
    at: InstalledPackAt,
    open: () => void,
): InstalledPackProps {
    const { library, held, installedAt, selected, failed, updatable = false, saves } = at;
    if (library || held === undefined || selected === undefined) return {};
    const heldVersion = held.name === selected.name && held.version === selected.version;
    // An update waiting takes Retry's place: Retry would install every type, Update only what is left.
    if (heldVersion && failed && !(updatable && installedAt !== undefined)) return { failed, ...(installedAt === undefined ? {} : { onRemoveData: open }) };
    if (installedAt === undefined) return {};
    const saving = saves ? { saves } : {};
    if (heldVersion) return updatable ? { onRemoveData: open, updates: true, ...saving } : { onRemoveData: open, restores: true, ...saving };
    return windowRoute({ id: selected, holding: { pack: held, recorded: true } }) === 'switch' ? { switches: true } : {};
}
