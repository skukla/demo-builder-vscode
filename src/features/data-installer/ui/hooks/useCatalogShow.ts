/**
 * What the Datapacks screen and the wizard's Datapacks step draw: every pack the catalog holds, in
 * order, narrowed by the Show list and then the filter box. Split out of `DatapackCatalogView` when
 * the Show list arrived, which took that view past its import limit.
 *
 * @module features/data-installer/ui/hooks/useCatalogShow
 */

import { useCallback, useMemo, useState } from 'react';
import { groupDatapacks, isHeld, withoutLayerCards, type DatapackGroup } from '../../services/datapackCatalog';
import type { CatalogPage } from '../../types';
import { DEFAULT_SHOW, inShow, inShowOrder, type CatalogShow } from '../catalogShow';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/** Fields a query is matched against: the id and the label, nothing else. */
const SEARCH_FIELDS: ReadonlyArray<keyof DatapackGroup> = ['name', 'displayName'];

export interface CatalogShowOptions {
    /** The catalog as loaded. */
    page: CatalogPage | null | undefined;
    /** What is believed installed here, or what the project arrived with: a layer's pack keeps its card. */
    installedPacks: ReadonlySet<string>;
    /** The pack this project holds or has chosen: Recommended never hides it. */
    held: ProjectDatapack | undefined;
    /** The filter box. */
    query: string;
    /** Draw the held pack first. Not where a press chooses, or the card would jump away from it. */
    heldFirst: boolean;
}

export interface CatalogShowState {
    show: CatalogShow;
    setShow: (show: CatalogShow) => void;
    /** Whether the Data Installer answered this load: an SC it has not has no such packs to choose. */
    installerAnswered: boolean;
    /** Every pack, before the Show list. */
    groups: DatapackGroup[];
    /** The packs the Show list leaves. */
    shown: DatapackGroup[];
    /** Those the filter box leaves too. */
    filtered: DatapackGroup[];
    /**
     * Take a version of the SC's own pack off at once, as its removal closes the flyout, rather than
     * when the list next comes back seconds later (owner, 2026-11-05). The next list replaces it.
     */
    hideRemoved: (id: DatapackId) => void;
}

/** The page without the versions just removed from the SC's datapacks. */
function withoutRemoved(page: CatalogPage | null | undefined, removed: readonly DatapackId[]): CatalogPage | null | undefined {
    if (!page || removed.length === 0) return page;
    const gone = (item: CatalogPage['items'][number]): boolean =>
        item.store === 'library' && removed.some((id) => id.name === item.id.name && id.version === item.id.version);
    return { ...page, items: page.items.filter((item) => !gone(item)) };
}

/**
 * The catalog narrowed for drawing.
 *
 * @param options - the catalog and what narrows it
 * @returns the Show list's state and the packs to draw
 */
export function useCatalogShow({ page, installedPacks, held, query, heldFirst }: CatalogShowOptions): CatalogShowState {
    const [chosen, setShow] = useState<CatalogShow>(DEFAULT_SHOW);
    // Kept with the page it was hidden from: the next page the screen loads has it gone for real.
    const [removed, setRemoved] = useState<{ from: typeof page; ids: DatapackId[] }>({ from: page, ids: [] });
    const hideRemoved = useCallback((id: DatapackId): void => {
        setRemoved((current) => ({ from: page, ids: current.from === page ? [...current.ids, id] : [id] }));
    }, [page]);
    const listed = useMemo(() => withoutRemoved(page, removed.from === page ? removed.ids : []), [page, removed]);
    // A choice that went away (the Data Installer stopped answering) falls back, rather than a list
    // showing a choice it no longer offers.
    const installerAnswered = page?.installerMissing === undefined;
    const show = chosen === 'installer' && !installerAnswered ? DEFAULT_SHOW : chosen;
    const groups = useMemo(() => {
        // A settings layer is reached from its pack's flyout, not as a demo of its own (step 09).
        const all = groupDatapacks(withoutLayerCards(listed?.items ?? [], installedPacks));
        return inShowOrder(all, (group) => heldFirst && isHeld(group, held));
    }, [listed, installedPacks, held, heldFirst]);
    const shown = useMemo(
        () => groups.filter((group) => inShow(group, show) || (show === DEFAULT_SHOW && isHeld(group, held))),
        [groups, show, held],
    );
    const filtered = useMemo(
        () => shown.filter((group) => matchesSearchFields(group, SEARCH_FIELDS, query)),
        [shown, query],
    );
    return { show, setShow, installerAnswered, groups, shown, filtered, hideRemoved };
}
