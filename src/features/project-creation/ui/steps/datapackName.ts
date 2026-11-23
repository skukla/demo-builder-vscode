/**
 * The chosen datapack, as the SC should read it: by its name, not its id (F284).
 *
 * The Build step's summary (`commerceSections.ts`, the Datapacks row) and the Final
 * Review's Datapack row both name the pack through this, so the two can never disagree.
 *
 * @module features/project-creation/ui/steps/datapackName
 */

import type { CatalogPage } from '@/features/data-installer/types';
import type { ProjectDatapack } from '@/types/datapack';
import type { WizardState } from '@/types/webview';

/**
 * The chosen pack's name: the one its card showed when chosen, or read from the catalog
 * for a pack the project arrived with (`useChosenDatapackName`). The recorded id only
 * when neither is known, which is a pack the catalog does not list.
 *
 * @param state - wizard state
 * @returns the name, or undefined when no pack is chosen
 */
export function chosenDatapackName(state: WizardState): string | undefined {
    return state.datapack ? (state.datapackDisplayName ?? state.datapack.name) : undefined;
}

/**
 * The name the catalog's card shows for a pack, matched by name as the Datapacks step
 * matches it (`isPack`): the one list shows a pack once, whichever store was recorded.
 *
 * @param page - the catalog as loaded
 * @param pack - the recorded pack
 * @returns the card's name, or undefined when the catalog does not list the pack
 */
export function catalogDatapackName(page: CatalogPage, pack: ProjectDatapack): string | undefined {
    const row = page.items.find((item) => item.id.name === pack.name);
    return row?.displayName || undefined;
}
