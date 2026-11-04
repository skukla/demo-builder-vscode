/**
 * What the catalog offers for the pack the open project holds:
 *
 * - Save and Save As, from the demo's pack card (`ProjectPackCard`, `.rptc/plans/datapack-save-as/`):
 *   the pick screens and the progress window (`useSaveStoreChanges`). Closing the progress window
 *   calls `onSaved`, since the library now holds a new version and the demo uses it.
 * - The pack's one Admin step (step 12), when Demo Builder's engine installed it: a quiet line for
 *   the flyout, its dialog mounted beside the flyout (`usePackSetupStep`).
 *
 * Moved out of `DatapackCatalogView` with the Admin step's dialog (DI-5, 2026-10-30), which would
 * otherwise have been its sixteenth import.
 *
 * @module features/data-installer/ui/hooks/useHeldPack
 */

import React from 'react';
import { usePackSetupStep } from './usePackSetupStep';
import { type SaveStoreChanges, useSaveStoreChanges } from './useSaveStoreChanges';
import type { DatapackId, ProjectDatapack } from '@/types/datapack';

export interface HeldPackInput {
    /** The pack whose flyout is open. */
    selected?: DatapackId;
    /** The pack the open project holds, as recorded on it. */
    held?: ProjectDatapack;
    /** The engine chosen. */
    engine?: 'service' | 'demo-builder';
    /** The open flyout's detail, once loaded. */
    detail?: { displayName: string };
    /** True while the flyout's detail is loading. */
    detailLoading: boolean;
    /** The save's progress window closed. Must be stable. */
    onSaved: () => void;
}

export interface HeldPack {
    /** Save and Save As, for the demo's pack card. */
    saves: Pick<SaveStoreChanges, 'offer' | 'offerSaveAs'>;
    /** The held pack's Admin step, as one line for the flyout. */
    setupStepLine: React.JSX.Element | null;
    /** The pick screen, the save's progress window and the Admin step's dialog: mount once, beside the flyout. */
    windows: React.JSX.Element;
}

export function useHeldPack({ selected, held, engine, detail, detailLoading, onSaved }: HeldPackInput): HeldPack {
    const storeChanges = useSaveStoreChanges(onSaved);
    const holdsSelected = held !== undefined && held.name === selected?.name && held.version === selected.version;
    const ownsStore = holdsSelected && engine === 'demo-builder';
    const setupStep = usePackSetupStep(ownsStore && detail && !detailLoading ? selected : undefined);

    return {
        saves: { offer: storeChanges.offer, offerSaveAs: storeChanges.offerSaveAs },
        setupStepLine: setupStep.line,
        windows: (
            <>
                {storeChanges.windows}
                {setupStep.dialog}
            </>
        ),
    };
}
