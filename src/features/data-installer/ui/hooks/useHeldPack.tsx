/**
 * What the catalog offers for the pack the open project holds, installed by Demo Builder's engine
 * (the one that keeps a record of what it made to read back):
 *
 * - "Save store changes to this pack" (datapack-engine step 05), which opens the pick screen first
 *   so what the SC added by hand can go in too (step 14); "Save from this store" opens it with no
 *   pack (`useSaveStoreChanges`). Closing the progress window calls `onSaved`, since the library
 *   now holds a new version.
 * - The pack's one Admin step (step 12): a quiet line for the flyout, its dialog mounted beside
 *   the flyout (`usePackSetupStep`).
 *
 * Both ask the same question, "is the flyout's pack the held one, with Demo Builder's engine?",
 * so it is asked once here. Moved out of `DatapackCatalogView` with the Admin step's dialog
 * (DI-5, 2026-10-30), which would otherwise have been its sixteenth import.
 *
 * @module features/data-installer/ui/hooks/useHeldPack
 */

import React, { useCallback } from 'react';
import { usePackSetupStep } from './usePackSetupStep';
import { useSaveStoreChanges } from './useSaveStoreChanges';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

export interface HeldPackInput {
    /** The pack whose flyout is open. */
    selected?: DatapackId;
    /** Which store the open flyout's pack lives in. */
    selectedStore: DatapackStoreName;
    /** The pack the open project holds, as recorded on it. */
    held?: ProjectDatapack;
    /** The engine chosen. */
    engine?: 'service' | 'demo-builder';
    /** The open flyout's detail, once loaded: its name, for the pick screen's title. */
    detail?: { displayName: string };
    /** True while the flyout's detail is loading. */
    detailLoading: boolean;
    /** The save's progress window closed. Must be stable. */
    onSaved: () => void;
}

export interface HeldPack {
    /** "Save store changes to this pack", for the held pack only. */
    offerSave?: (id: DatapackId) => void;
    /** Create datapack, Commerce: the pick screen with no pack. */
    saveFromStore: () => void;
    /** The held pack's Admin step, as one line for the flyout. */
    setupStepLine: React.JSX.Element | null;
    /** The pick screen, the save's progress window and the Admin step's dialog: mount once, beside the flyout. */
    windows: React.JSX.Element;
}

export function useHeldPack({ selected, selectedStore, held, engine, detail, detailLoading, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const ownsStore = holdsSelected && engine === 'demo-builder';
    const offerStoreSave = storeChanges.offer;
    const displayName = detail?.displayName;
    const offerSave = useCallback(
        (id: DatapackId): void => offerStoreSave({ id, displayName: displayName ?? id.name, source: selectedStore }),
        [offerStoreSave, displayName, selectedStore],
    );
    const saveFromStore = useCallback((): void => offerStoreSave(), [offerStoreSave]);
    const setupStep = usePackSetupStep(ownsStore && detail && !detailLoading ? selected : undefined);

    return {
        offerSave: ownsStore ? offerSave : undefined,
        saveFromStore,
        setupStepLine: setupStep.line,
        windows: (
            <>
                {storeChanges.windows}
                {setupStep.dialog}
            </>
        ),
    };
}
