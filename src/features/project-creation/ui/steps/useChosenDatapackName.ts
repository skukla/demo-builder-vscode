/**
 * Name a datapack the project arrived with (F284).
 *
 * A pack chosen on the Datapacks step records its card's name. An imported, copied or
 * edited project arrives with only the pack's id, and the summary shows that row before
 * the SC ever opens the step, so this reads the catalog once and records the name.
 *
 * @module features/project-creation/ui/steps/useChosenDatapackName
 */

import { useEffect } from 'react';
import { catalogDatapackName } from './datapackName';
import type { CatalogPage } from '@/features/data-installer/types';
import { CATALOG_REQUEST } from '@/features/data-installer/ui/catalogShow';
import { useDataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';
import type { WizardState } from '@/types/webview';

/**
 * Record `datapackDisplayName` for a chosen pack that has none.
 *
 * @param state - wizard state
 * @param updateState - the wizard's state setter
 */
export function useChosenDatapackName(
    state: WizardState,
    updateState: (updates: Partial<WizardState>) => void,
): void {
    const { load, value, settled, loading } = useDataInstallerRequest<CatalogPage>('find-datapacks');
    const pack = state.datapack;
    const unnamed = pack !== undefined && state.datapackDisplayName === undefined;

    // Read once: a pack the catalog does not list keeps its id rather than asking again.
    useEffect(() => {
        if (unnamed && !settled && !loading) load(CATALOG_REQUEST);
    }, [unnamed, settled, loading, load]);

    useEffect(() => {
        if (!unnamed || !pack || !value) return;
        const name = catalogDatapackName(value, pack);
        if (name) updateState({ datapackDisplayName: name });
    }, [unnamed, pack, value, updateState]);
}
