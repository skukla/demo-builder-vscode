/**
 * The catalog header's two ways to add a pack: capture one from this project's
 * instance ("Export from this instance"), or load one from a datapack file; and
 * "Clear demo data", which clears the stores the SC ticks of what Demo Builder did not
 * install (datapack-engine step 10), in the screen's progress window.
 *
 * Each link owns the modal it opens, so the catalog view carries no modal's
 * state — it was past its size guideline before either existed beside the other.
 *
 * The Commerce export is the Data Installer service's own, so the export screen offers it only
 * with the service engine chosen (2026-10-29): the service has not saved what it reads since
 * August, and with Demo Builder's engine, the default, it offered an export that cannot work
 * into a catalog other teams share. The link itself always shows, since an ACO pack is made
 * with either engine (datapack-engine step 14 item 19).
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
    /** The service engine is chosen, so its Commerce export can run; an ACO pack always can. */
    canExport: boolean;
}

export function CatalogHeaderActions({
    onCatalogChanged,
    canExport,
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
            <Link isQuiet onPress={() => setExporting(true)}>
                Export from this instance
            </Link>
            <Link isQuiet onPress={() => setLoadingFile(true)}>
                Load from file
            </Link>
            <Link isQuiet onPress={() => setClearing(true)}>
                Clear demo data
            </Link>
            {exporting ? <ExportDatapackModal onClose={closeExport} commerceExport={canExport} /> : null}
            {loadingFile ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
            {clearing ? <ClearDemoDataModal onClose={closeClear} onClear={startClear} /> : null}
            {progressWindow}
        </>
    );
}
