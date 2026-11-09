/**
 * The datapack list, for the two screens that show it (the Datapacks screen and the wizard's
 * Datapacks step): one load of everything each source has, which the Show list then filters, read
 * again whenever a setting it depends on changes. An SC who has just changed one has no reason to
 * know the list needs a Refresh (owner, 2026-11-05).
 *
 * @module features/data-installer/ui/hooks/useDatapackCatalog
 */

import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { DATAPACK_LIST_CHANGED_MESSAGE, type CatalogPage } from '../../types';
import { CATALOG_REQUEST } from '../catalogShow';
import { useDataInstallerRequest, type DataInstallerRequest } from './useDataInstallerRequest';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface DatapackCatalog extends Omit<DataInstallerRequest<CatalogPage>, 'load'> {
    /** Read the list again. Stable: an effect can depend on it. */
    refresh: () => void;
    /** The list as the "no access" notice reads it: dismissed at once when the SC closes it. */
    noticePage: CatalogPage | null;
    /** Close the "no access" notice; the extension remembers it on this machine (2026-11-03). */
    dismissNoAccess: () => void;
}


/**
 * Load the list, and keep it following its settings and the packs themselves (F66).
 *
 * @param alsoOnChange - what else to read again when the list changes, held in a ref so a screen can
 *   set it after the callbacks it needs exist (a project's Datapacks reads which pack it holds)
 * @returns the list as loaded, where its request stands, and a way to read it again
 */
export function useDatapackCatalog(alsoOnChange?: RefObject<(() => void) | undefined>): DatapackCatalog {
    const { load, ...request } = useDataInstallerRequest<CatalogPage>('find-datapacks');
    const refresh = useCallback((): void => load(CATALOG_REQUEST), [load]);
    useEffect(() => {
        refresh();
    }, [refresh]);
    const listChanged = useCallback((): void => {
        refresh();
        alsoOnChange?.current?.();
    }, [refresh, alsoOnChange]);
    useVSCodeMessage(DATAPACK_LIST_CHANGED_MESSAGE, listChanged, [listChanged]);
    const [noAccessClosed, setNoAccessClosed] = useState(false);
    const dismissNoAccess = useCallback((): void => {
        setNoAccessClosed(true);
        webviewClient.postMessage('dismiss-datapack-no-access');
    }, []);
    const { value } = request;
    const noticePage = useMemo(() => (value && noAccessClosed ? { ...value, noAccessDismissed: true } : value), [value, noAccessClosed]);
    return { ...request, refresh, noticePage, dismissNoAccess };
}
