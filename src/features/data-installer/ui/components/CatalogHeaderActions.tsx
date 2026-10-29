/**
 * The catalog header's two ways to add a pack: capture one from this project's
 * instance ("Export from this instance"), or load one from a datapack file.
 *
 * Each link owns the modal it opens, so the catalog view carries neither modal's
 * state — it was past its size guideline before either existed beside the other.
 *
 * Export is the Data Installer service's own, so its link shows only with the service
 * engine chosen (2026-10-29): the service has not saved what it reads since August, and
 * with Demo Builder's engine, the default, the link offered an export that cannot work
 * into a catalog other teams share.
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { Link } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { ExportDatapackModal } from './ExportDatapackModal';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /** The service engine is chosen, so its export can run. */
    canExport: boolean;
}

export function CatalogHeaderActions({
    onCatalogChanged,
    canExport,
}: CatalogHeaderActionsProps): React.JSX.Element {
    const [exporting, setExporting] = useState(false);
    const [loadingFile, setLoadingFile] = useState(false);

    const closeExport = useCallback((): void => setExporting(false), []);
    // Stable, because the load modal's effect depends on it.
    const closeLoad = useCallback((): void => {
        setLoadingFile(false);
        onCatalogChanged();
    }, [onCatalogChanged]);

    return (
        <>
            {canExport ? (
                <Link isQuiet onPress={() => setExporting(true)}>
                    Export from this instance
                </Link>
            ) : null}
            <Link isQuiet onPress={() => setLoadingFile(true)}>
                Load from file
            </Link>
            {exporting ? <ExportDatapackModal onClose={closeExport} /> : null}
            {loadingFile ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
        </>
    );
}
