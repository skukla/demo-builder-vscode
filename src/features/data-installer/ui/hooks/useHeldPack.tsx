/**
 * What the catalog offers for the pack the open project holds:
 *
 * - Save Changes, in the flyout of the demo's pack and in the header, whoever owns the pack: into it
 *   when it is the SC's, else into a new pack of theirs (owner, 2026-11-09); the header's Create
 *   Datapack when the demo has none. The pick screens and the progress window (`useSaveStoreChanges`).
 *   A finished save calls `onSaved`, since the library now holds a new version and the demo uses it.
 * - The pack's one Admin step (step 12), when Demo Builder's engine installed it: a quiet line for
 *   the flyout, its dialog mounted beside the flyout (`usePackSetupStep`).
 *
 * Moved out of `DatapackCatalogView` with the Admin step's dialog (DI-5, 2026-10-30), which would
 * otherwise have been its sixteenth import.
 *
 * @module features/data-installer/ui/hooks/useHeldPack
 */

import React, { useMemo } from 'react';
import { usePackSetupStep } from './usePackSetupStep';
import { type SaveStoreChanges, useSaveStoreChanges } from './useSaveStoreChanges';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** What decides where a save of the demo's pack goes: its name, and whose it is. */
export interface HeldPackInfo {
    displayName: string;
    store?: DatapackStoreName;
    mine?: boolean;
    team?: boolean;
}

export interface HeldPackInput {
    /** The pack whose flyout is open. */
    selected?: DatapackId;
    /** The pack the open project holds, as recorded on it. */
    held?: ProjectDatapack;
    /** When Demo Builder's engine installed it: a save builds on what it put in the store. */
    installedAt?: string;
    /** The open flyout's detail, once loaded. */
    detail?: HeldPackInfo;
    /** The demo's pack as the catalog lists it, for the header's Save Changes. */
    heldInCatalog?: HeldPackInfo;
    /** True while the flyout's detail is loading. */
    detailLoading: boolean;
    /** The save's progress window closed. Must be stable. */
    onSaved: () => void;
}

export interface HeldPack {
    /** Create Datapack: a new pack from what is picked, named first; for a demo with no pack. */
    offerSaveAs: SaveStoreChanges['offerSaveAs'];
    /** Save Changes in the flyout of the demo's pack, whoever owns it. */
    saveChanges?: () => void;
    /** The flyout's save makes a new pack (a team pack, or a colleague's): it reads Save As New Datapack. */
    saveChangesAsNew: boolean;
    /** Save Changes in the header: the same save, for the demo's pack, from anywhere on the screen. */
    saveDemoChanges?: () => void;
    /** The header's save makes a new pack: it reads Save As New Datapack. */
    saveDemoAsNew: boolean;
    /** The held pack's Admin step, as one line for the flyout. */
    setupStepLine: React.JSX.Element | null;
    /** The pick screen, the save's progress window and the Admin step's dialog: mount once, beside the flyout. */
    windows: React.JSX.Element;
}

/**
 * Where a save of the demo's pack goes (owner, 2026-11-09, walk F83): into it, a new version, when
 * it is the SC's own library pack; else into a new pack of theirs (a team pack, or another SC's),
 * which the demo then uses. The server decides the same (`saveIntoFor`).
 */
function savesInto(held: ProjectDatapack, info: HeldPackInfo): boolean {
    return (held.store ?? 'library') === 'library' && info.mine === true && info.team !== true;
}

function saveOf(held: ProjectDatapack, info: HeldPackInfo, offers: Pick<SaveStoreChanges, 'offer' | 'offerSaveAs'>): () => void {
    const pack = { id: { name: held.name, version: held.version }, displayName: info.displayName, source: held.store ?? 'library' };
    if (savesInto(held, info)) return () => offers.offer(pack);
    return () => offers.offerSaveAs('', pack);
}

export function useHeldPack({ selected, held, installedAt, detail, heldInCatalog, detailLoading, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const setupStep = usePackSetupStep(holdsSelected && detail && !detailLoading ? selected : undefined);
    // Any version of the demo's pack, once Demo Builder installed it: a save writes a new version, or
    // a new pack of the SC's when this one is not theirs to change (owner, 2026-11-09).
    const installedHere = held !== undefined && installedAt !== undefined;
    // The version too (walk F100): another version of the demo's pack has nothing in the store to save.
    const flyoutShowsHeld = installedHere && held.name === selected?.name && held.version === selected.version && !detailLoading && detail !== undefined;
    const { offer, offerSaveAs } = storeChanges;
    // Kept across renders: the header's handler is stable by contract (`CatalogHeaderActions`).
    const saveChanges = useMemo(
        () => (flyoutShowsHeld && detail ? saveOf(held, detail, { offer, offerSaveAs }) : undefined),
        [flyoutShowsHeld, held, detail, offer, offerSaveAs],
    );
    const saveDemoChanges = useMemo(
        () => (installedHere && heldInCatalog ? saveOf(held, heldInCatalog, { offer, offerSaveAs }) : undefined),
        [installedHere, held, heldInCatalog, offer, offerSaveAs],
    );

    return {
        offerSaveAs: storeChanges.offerSaveAs,
        ...(saveChanges ? { saveChanges } : {}),
        // Named for what happens (owner, 2026-11-09): Save Changes into the SC's own pack, Save As
        // New Datapack from anyone else's, which "Save Changes" read as changing.
        saveChangesAsNew: Boolean(held && detail && !savesInto(held, detail)),
        ...(saveDemoChanges ? { saveDemoChanges } : {}),
        saveDemoAsNew: Boolean(held && heldInCatalog && !savesInto(held, heldInCatalog)),
        setupStepLine: setupStep.line,
        windows: (
            <>
                {storeChanges.windows}
                {setupStep.dialog}
            </>
        ),
    };
}
