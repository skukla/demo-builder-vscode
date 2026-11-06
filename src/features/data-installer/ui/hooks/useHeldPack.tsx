/**
 * What the catalog offers for the pack the open project holds:
 *
 * - Save Changes, in the flyout of the demo's own pack when it is the SC's (owner, 2026-11-04), and
 *   the header's Create Datapack: the pick screens and the progress window (`useSaveStoreChanges`).
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
import { usePackSetupStep } from './usePackSetupStep';
import { type SaveStoreChanges, useSaveStoreChanges } from './useSaveStoreChanges';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

export interface HeldPackInput {
    /** The pack whose flyout is open. */
    selected?: DatapackId;
    /** The pack the open project holds, as recorded on it. */
    held?: ProjectDatapack;
    /** The open flyout's detail, once loaded. */
    detail?: { displayName: string; store?: DatapackStoreName; mine?: boolean };
    /** True while the flyout's detail is loading. */
    detailLoading: boolean;
    /** The save's progress window closed. Must be stable. */
    onSaved: () => void;
}

export interface HeldPack {
    /** Create Datapack: a new pack from the store, named first. */
    offerSaveAs: SaveStoreChanges['offerSaveAs'];
    /** Save Changes into the open flyout's pack: only when it is the demo's own and the SC's. */
    saveChanges?: () => void;
    /** The held pack's Admin step, as one line for the flyout. */
    setupStepLine: React.JSX.Element | null;
    /** The pick screen, the save's progress window and the Admin step's dialog: mount once, beside the flyout. */
    windows: React.JSX.Element;
}

export function useHeldPack({ selected, held, detail, detailLoading, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const setupStep = usePackSetupStep(holdsSelected && detail && !detailLoading ? selected : undefined);
    // Any version of the demo's pack: a save writes a new one either way.
    const savable = held && held.name === selected?.name && !detailLoading && detail?.store === 'library' && detail.mine === true;
    const offer = storeChanges.offer;
    const saveChanges = useCallback((): void => {
        if (held && detail) offer({ id: { name: held.name, version: held.version }, displayName: detail.displayName, source: held.store ?? 'library' });
    }, [offer, held, detail]);

    return {
        offerSaveAs: storeChanges.offerSaveAs,
        ...(savable ? { saveChanges } : {}),
        setupStepLine: setupStep.line,
        windows: (
            <>
                {storeChanges.windows}
                {setupStep.dialog}
            </>
        ),
    };
}
