/**
 * What the catalog offers for the pack the open project holds:
 *
 * - Save Changes, in the flyout of the demo's pack, whoever owns the pack: into it when it is the
 *   SC's, else into a new pack of theirs (owner, 2026-11-09). The header's Save and Save As New on
 *   the demo's pack, and its Create when the demo has none (step-04 S1, `headerSave`). Save opens
 *   "Save Changes to My Luma", Save As New its own form, its name empty from the SC's own datapack
 *   and "My Bodea" from anyone else's (step-04 S2, J3-1); the windows and the progress window are
 *   `useSaveStoreChanges`'s.
 *   A finished save calls `onSaved`, since the library now holds a new version and the demo uses it.
 * - The pack's one Admin step (step 12), when Demo Builder's engine installed it: a quiet line for
 *   the flyout, its dialog mounted beside the flyout (`usePackSetupStep`).
 *
 * Moved out of `DatapackCatalogView` with the Admin step's dialog (DI-5, 2026-10-30), which would
 * otherwise have been its sixteenth import.
 *
 * @module features/data-installer/ui/hooks/useHeldPack
 */

import React, { useCallback, useMemo } from 'react';
import { freeName } from '../../saveAsName';
import type { PackBeingSaved } from '../components/save/packBeingSaved';
import { type HeldPackInfo, savesInto } from '../headerSave';
import { usePackSetupStep } from './usePackSetupStep';
import { type SaveStoreChanges, useSaveStoreChanges } from './useSaveStoreChanges';
import { type DatapackId, type ProjectDatapack, storeOf } from '@/types/datapack';

export interface HeldPackInput {
    /** The pack whose flyout is open. */
    selected?: DatapackId;
    /** The pack the open project holds, as recorded on it. */
    held?: ProjectDatapack;
    /** When Demo Builder's engine installed it: a save builds on what it put in the store. */
    installedAt?: string;
    /** The open flyout's detail, once loaded. */
    detail?: HeldPackInfo;
    /** The demo's pack as the catalog lists it, for the header's save. */
    heldInCatalog?: HeldPackInfo;
    /** True while the flyout's detail is loading. */
    detailLoading: boolean;
    /** The SC's own datapacks' names, which a new one may not take. Must be stable. */
    ownNames: readonly string[];
    /** The save's progress window closed. Must be stable. */
    onSaved: () => void;
}

export interface HeldPack {
    /** Create Datapack: a new pack from what is picked, named first; for a demo with no pack. Stable. */
    create: SaveStoreChanges['create'];
    /** Save Changes in the flyout of the demo's pack, whoever owns it. */
    saveChanges?: () => void;
    /** The flyout's save makes a new pack (a team pack, or a colleague's): it reads Save As New Datapack. */
    saveChangesAsNew: boolean;
    /** The header's Save: into the demo's pack, a new version. Stable. */
    saveDemo: () => void;
    /** The header's Save As New: a new pack of the SC's from the demo's pack. Stable. */
    saveDemoAsNew: () => void;
    /** The held pack's Admin step, as one line for the flyout. */
    setupStepLine: React.JSX.Element | null;
    /** The save windows, the save's progress window and the Admin step's dialog: mount once, beside the flyout. */
    windows: React.JSX.Element;
}

/**
 * The demo's pack, as a save names it: by the catalog's name for it, else its own; in the store it
 * records, the Data Installer when it records none (`storeOf`), as every other reader takes it.
 */
function packOf(held: ProjectDatapack, info: HeldPackInfo | undefined): PackBeingSaved {
    return { id: { name: held.name, version: held.version }, displayName: info?.displayName ?? held.name, source: storeOf(held) };
}

/**
 * Save As New's starting name (J3-1, owner 2026-11-12): empty from the SC's own datapack, else "My
 * Bodea", or "My Bodea 2" when that is taken.
 */
function startNameOf(held: ProjectDatapack, pack: PackBeingSaved, info: HeldPackInfo | undefined, ownNames: readonly string[]): string {
    return info && savesInto(held, info) ? '' : freeName(pack.displayName, ownNames);
}

/**
 * Where a save of the demo's pack goes (owner, 2026-11-09, walk F83): into it, a new version, when
 * it is the SC's own library pack (`savesInto`); else into a new pack of theirs.
 */
function saveOf(held: ProjectDatapack, info: HeldPackInfo, offers: Pick<SaveStoreChanges, 'save' | 'saveAsNew'>, ownNames: readonly string[]): () => void {
    const pack = packOf(held, info);
    if (savesInto(held, info)) return () => offers.save(pack);
    return () => offers.saveAsNew(pack, startNameOf(held, pack, info, ownNames));
}

export function useHeldPack({ selected, held, installedAt, detail, heldInCatalog, detailLoading, ownNames, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved, ownNames);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const setupStep = usePackSetupStep(holdsSelected && detail && !detailLoading ? selected : undefined);
    // Any version of the demo's pack, once Demo Builder installed it: a save writes a new version, or
    // a new pack of the SC's when this one is not theirs to change (owner, 2026-11-09).
    const installedHere = held !== undefined && installedAt !== undefined;
    // The version too (walk F100): another version of the demo's pack has nothing in the store to save.
    const flyoutShowsHeld = installedHere && held.name === selected?.name && held.version === selected.version && !detailLoading && detail !== undefined;
    const { save, saveAsNew } = storeChanges;
    // Kept across renders: the header's handler is stable by contract (`CatalogHeaderActions`).
    const saveChanges = useMemo(
        () => (flyoutShowsHeld && detail ? saveOf(held, detail, { save, saveAsNew }, ownNames) : undefined),
        [flyoutShowsHeld, held, detail, save, saveAsNew, ownNames],
    );
    // The header's choices: `headerSave` decides which are drawn, so each acts only on a held pack.
    const saveDemo = useCallback((): void => {
        if (held) save(packOf(held, heldInCatalog));
    }, [held, heldInCatalog, save]);
    const saveDemoAsNew = useCallback((): void => {
        if (!held) return;
        const pack = packOf(held, heldInCatalog);
        saveAsNew(pack, startNameOf(held, pack, heldInCatalog, ownNames));
    }, [held, heldInCatalog, saveAsNew, ownNames]);

    return {
        create: storeChanges.create,
        ...(saveChanges ? { saveChanges } : {}),
        // Named for what happens (owner, 2026-11-09): Save Changes into the SC's own pack, Save As
        // New Datapack from anyone else's, which "Save Changes" read as changing.
        saveChangesAsNew: Boolean(held && detail && !savesInto(held, detail)),
        saveDemo,
        saveDemoAsNew,
        setupStepLine: setupStep.line,
        windows: (
            <>
                {storeChanges.windows}
                {setupStep.dialog}
            </>
        ),
    };
}
