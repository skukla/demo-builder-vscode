/**
 * The catalog header's two ways to add a pack: capture one from this project's
 * instance, or load one from a datapack file; and
 * "Clear demo data", which clears the stores the SC ticks of what Demo Builder did not
 * install (datapack-engine step 10), in the screen's progress window.
 *
 * Each link owns the modal it opens, so the catalog view carries no modal's
 * state — it was past its size guideline before either existed beside the other.
 *
 * Capturing depends on the engine. With the service's, "Export from this instance" opens its
 * export into the shared catalog. With Demo Builder's, the default, "Save from this store"
 * opens the pick screen, which saves into this demo's own library pack (datapack-engine step
 * 14); the view hosts that screen with the save's progress window (`useSaveStoreChanges`).
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { Link } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { useClearDemoData } from '../hooks/useClearDemoData';
import { ClearDemoDataModal } from './ClearDemoDataModal';
import { ExportDatapackModal } from './ExportDatapackModal';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import type { WipeStoreChoice } from '@/types/demoDataWipe';

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /** The engine chosen, which decides how a pack is captured from the store. */
    engine?: 'service' | 'demo-builder';
    /** Demo Builder's engine: open the pick screen with no pack. Stable. */
    onSaveFromStore: () => void;
}

export function CatalogHeaderActions({
    onCatalogChanged,
    engine,
    onSaveFromStore,
}: CatalogHeaderActionsProps): React.JSX.Element {
    const [exporting, setExporting] = useState(false);
    const [loadingFile, setLoadingFile] = useState(false);
    const [clearing, setClearing] = useState(false);
    const { clear, progressWindow } = useClearDemoData(onCatalogChanged);

    const closeExport = useCallback((): void => setExporting(false), []);
    const closeClear = useCallback((): void => setClearing(false), []);
    const startClear = useCallback(
        (stores: WipeStoreChoice[], token: string): void => {
            setClearing(false);
            clear(stores, token);
        },
        [clear],
    );
    // Stable, because the load modal's effect depends on it.
    const closeLoad = useCallback((): void => {
        setLoadingFile(false);
        onCatalogChanged();
    }, [onCatalogChanged]);

    return (
        <>
            {engine === 'service' ? (
                <Link isQuiet onPress={() => setExporting(true)}>
                    Export from this instance
                </Link>
            ) : null}
            {engine === 'demo-builder' ? (
                <Link isQuiet onPress={onSaveFromStore}>
                    Save from this store
                </Link>
            ) : null}
            <Link isQuiet onPress={() => setLoadingFile(true)}>
                Load from file
            </Link>
            <Link isQuiet onPress={() => setClearing(true)}>
                Clear demo data
            </Link>
            {exporting ? <ExportDatapackModal onClose={closeExport} /> : null}
            {loadingFile ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
            {clearing ? <ClearDemoDataModal onClose={closeClear} onClear={startClear} /> : null}
            {progressWindow}
        </>
    );
}
