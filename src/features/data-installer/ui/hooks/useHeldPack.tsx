/**
 * What the catalog offers for the pack the open project holds:
 *
 * - The header's Save and Save As New on the demo's pack, and its Create when the demo has none
 *   (step-04 S1, `headerSave`): into the demo's pack when it is the SC's, else into a new pack of
 *   theirs (owner, 2026-11-09). The flyout saves nothing (step-04 S5). Save opens
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

import React, { useCallback } from 'react';
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

export function useHeldPack({ selected, held, detail, heldInCatalog, detailLoading, ownNames, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved, ownNames);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const setupStep = usePackSetupStep(holdsSelected && detail && !detailLoading ? selected : undefined);
    const { save, saveAsNew } = storeChanges;
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
