/**
 * The datapack list, for the two screens that show it (the Datapacks screen and the wizard's
 * Datapacks step): one load of everything each source has, which the Show list then filters, read
 * again whenever a setting it depends on changes. An SC who has just changed one has no reason to
 * know the list needs a Refresh (owner, 2026-11-05).
 *
 * @module features/data-installer/ui/hooks/useDatapackCatalog
 */

import { useCallback, useEffect } from 'react';
import { DATAPACK_SETTINGS_CHANGED_MESSAGE, type CatalogPage } from '../../types';
import { CATALOG_REQUEST } from '../catalogShow';
import { useDataInstallerRequest, type DataInstallerRequest } from './useDataInstallerRequest';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';

export interface DatapackCatalog extends Omit<DataInstallerRequest<CatalogPage>, 'load'> {
    /** Read the list again. Stable: an effect can depend on it. */
    refresh: () => void;
}

/**
 * Load the list, and keep it following its settings.
 *
 * @returns the list as loaded, where its request stands, and a way to read it again
 */
export function useDatapackCatalog(): DatapackCatalog {
    const { load, ...request } = useDataInstallerRequest<CatalogPage>('find-datapacks');
    const refresh = useCallback((): void => load(CATALOG_REQUEST), [load]);
    useEffect(() => {
        refresh();
    }, [refresh]);
    useVSCodeMessage(DATAPACK_SETTINGS_CHANGED_MESSAGE, refresh, [refresh]);
    return { ...request, refresh };
}
