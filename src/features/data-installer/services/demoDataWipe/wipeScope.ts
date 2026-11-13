/**
 * Which websites a wipe covers (datapack-simplification step 06, owner 2026-11-11): always WHOLE
 * websites, every store and store view of each. Clear no longer picks stores, so nothing is judged
 * for a website only partly chosen.
 *
 * What the chosen set owns is judged against the WHOLE set, never one website at a time: a root
 * category is **cleared** only when every store using it, on any website, is chosen; one a store of a
 * website not chosen also uses is **shared**, and its categories stay.
 *
 * Reads nothing: it works on the store structure `readWipeStructure` reads, the same three lists
 * (`store/websites`, `store/storeGroups`, `store/storeViews`) `storeScopeOf` and the Business
 * Structure step's store discovery read, in the same `CommerceStoreStructure` shape.
 *
 * @module features/data-installer/services/demoDataWipe/wipeScope
 */

import { WipeScopeError } from './wipeReads';
import type { CommerceStoreGroup, CommerceStoreStructure } from '@/types/commerceStore';

/** One store of a chosen website, with its website and the views under it. */
export interface WipeStore {
    id: number;
    code: string;
    name: string;
    rootCategoryId: string;
    website: { id: number; code: string; name: string };
    views: Array<{ id: number; code: string; name: string }>;
}

/** The chosen websites, and what the set as a whole owns. */
export interface WipeScope {
    /** Every store of the chosen websites. */
    stores: WipeStore[];
    /** Every view of those stores, by id: orders name these in `store_id`. */
    viewIds: Set<number>;
    /** The chosen websites, by id, in the store's own order. */
    websiteIds: number[];
    /** The chosen websites, by code and name, in the store's own order. */
    websites: Array<{ code: string; name: string }>;
    /** Roots every store using them is chosen: their categories are cleared. */
    clearedRoots: Set<string>;
    /** Roots of chosen stores a store of a website not chosen also uses: their categories stay. */
    sharedRoots: Set<string>;
    /** The chosen websites' codes, sorted and joined: the same whichever order they were named in. */
    key: string;
}

function storeOf(structure: CommerceStoreStructure, group: CommerceStoreGroup): WipeStore {
    const site = structure.websites.find((w) => String(w.id) === String(group.website_id));
    const views = structure.storeViews.filter((v) => String(v.store_group_id) === String(group.id));
    return {
        id: Number(group.id),
        code: group.code,
        name: group.name,
        rootCategoryId: String(group.root_category_id),
        website: { id: Number(group.website_id), code: site?.code ?? String(group.website_id), name: site?.name ?? '' },
        views: views.map((v) => ({ id: Number(v.id), code: v.code, name: v.name })),
    };
}

/** Which roots of the chosen stores the set clears, and which a store not chosen shares. */
function rootsOf(structure: CommerceStoreStructure, chosen: ReadonlySet<number>): Pick<WipeScope, 'clearedRoots' | 'sharedRoots'> {
    const clearedRoots = new Set<string>();
    const sharedRoots = new Set<string>();
    const roots = new Set(structure.storeGroups.filter((g) => chosen.has(Number(g.website_id))).map((g) => String(g.root_category_id)));
    for (const root of roots) {
        const users = structure.storeGroups.filter((g) => String(g.root_category_id) === root);
        (users.every((g) => chosen.has(Number(g.website_id))) ? clearedRoots : sharedRoots).add(root);
    }
    return { clearedRoots, sharedRoots };
}

/**
 * The chosen websites, from the store as it is now.
 *
 * @throws WipeScopeError naming a website the store does not have, or when none is named
 */
export function resolveWipeScope(structure: CommerceStoreStructure, websiteCodes: readonly string[]): WipeScope {
    if (websiteCodes.length === 0) throw new WipeScopeError('Name at least one website to clear.');
    const unknown = websiteCodes.find((code) => !structure.websites.some((w) => w.code === code));
    if (unknown !== undefined) throw new WipeScopeError(`Commerce has no website ${unknown}.`);
    const sites = structure.websites.filter((w) => websiteCodes.includes(w.code));
    const chosen = new Set(sites.map((w) => Number(w.id)));
    const stores = structure.storeGroups.filter((g) => chosen.has(Number(g.website_id))).map((g) => storeOf(structure, g));
    return {
        stores,
        viewIds: new Set(stores.flatMap((s) => s.views.map((v) => v.id))),
        websiteIds: [...chosen],
        websites: sites.map((w) => ({ code: w.code, name: w.name })),
        ...rootsOf(structure, chosen),
        key: sites.map((w) => w.code).sort().join(','),
    };
}
