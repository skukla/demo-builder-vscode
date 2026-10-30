/**
 * Which stores a wipe covers (datapack-engine step 10, owner 2026-10-30). SCs run several demos on
 * one Commerce instance: some give each demo its own website, some its own STORE on one website. So
 * the unit chosen is the store (store group); naming a website without a store chooses all of its
 * stores; store views are listed under their store and never chosen on their own.
 *
 * What the chosen stores own is judged against the WHOLE set, never one store at a time:
 * - a website is **wholly chosen** when every one of its stores is, else **partly chosen**;
 * - a root category is **cleared** only when every store using it, on any website, is chosen; one a
 *   store not chosen also uses is **shared**, and the stores sharing it are named;
 * - a root only stores not chosen use is **another demo's** (a product in it belongs elsewhere).
 *
 * Reads nothing: it works on the store structure `readWipeStructure` reads, the same three lists
 * (`store/websites`, `store/storeGroups`, `store/storeViews`) `storeScopeOf` and the Business
 * Structure step's store discovery read, in the same `CommerceStoreStructure` shape.
 *
 * @module features/data-installer/services/demoDataWipe/wipeScope
 */

import { WipeScopeError } from './wipeReads';
import type { CommerceStoreGroup, CommerceStoreStructure, CommerceWebsite } from '@/types/commerceStore';
import type { WipeChoiceWebsite, WipeStoreChoice } from '@/types/demoDataWipe';

/** One chosen store, with its website and the views under it. */
export interface WipeStore {
    id: number;
    code: string;
    name: string;
    rootCategoryId: string;
    website: { id: number; code: string; name: string };
    views: Array<{ id: number; code: string; name: string }>;
}

/** The chosen stores, and what the set as a whole owns. */
export interface WipeScope {
    stores: WipeStore[];
    /** Every view of the chosen stores, by id: orders and customers name these in `store_id`. */
    viewIds: Set<number>;
    websites: { whole: number[]; part: number[] };
    /** Roots every store using them is chosen: their categories are cleared. */
    clearedRoots: Set<string>;
    /** Roots of chosen stores another store also uses: "the store X (website Y)", per root. */
    sharedRoots: Map<string, string[]>;
    /** Roots only stores not chosen use: another demo's catalog. */
    otherRoots: Set<string>;
    /** The chosen stores, the same whichever way they were named: "website/store", sorted. */
    key: string;
}

const groupKey = (group: CommerceStoreGroup): string => String(group.id);

function websiteByCode(structure: CommerceStoreStructure, code: string): CommerceWebsite {
    const site = structure.websites.find((candidate) => candidate.code === code);
    if (!site) throw new WipeScopeError(`The store has no website ${code}.`);
    return site;
}

/** The groups the choices name, each once, in the store's own order. */
function chosenGroups(structure: CommerceStoreStructure, choices: readonly WipeStoreChoice[]): CommerceStoreGroup[] {
    if (choices.length === 0) throw new WipeScopeError('Name at least one store to clear.');
    const chosen = new Set<string>();
    for (const choice of choices) {
        const site = websiteByCode(structure, choice.websiteCode);
        const groups = structure.storeGroups.filter((g) => String(g.website_id) === String(site.id));
        const named = choice.storeCode === undefined ? groups : groups.filter((g) => g.code === choice.storeCode);
        if (named.length === 0) throw new WipeScopeError(`The website ${site.code} has no store ${choice.storeCode}.`);
        named.forEach((g) => chosen.add(groupKey(g)));
    }
    return structure.storeGroups.filter((g) => chosen.has(groupKey(g)));
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

/** Which roots the set clears, shares (naming the stores not chosen) and leaves to other demos. */
function rootsOf(structure: CommerceStoreStructure, chosen: Set<string>): Pick<WipeScope, 'clearedRoots' | 'sharedRoots' | 'otherRoots'> {
    const codeOf = new Map(structure.websites.map((w) => [String(w.id), w.code]));
    const clearedRoots = new Set<string>();
    const sharedRoots = new Map<string, string[]>();
    const otherRoots = new Set<string>();
    const roots = [...new Set(structure.storeGroups.map((g) => String(g.root_category_id)))];
    for (const root of roots) {
        const users = structure.storeGroups.filter((g) => String(g.root_category_id) === root);
        const notChosen = users.filter((g) => !chosen.has(groupKey(g)));
        if (notChosen.length === 0) clearedRoots.add(root);
        else if (notChosen.length === users.length) otherRoots.add(root);
        else sharedRoots.set(root, notChosen.map((g) => `the store ${g.code} (website ${codeOf.get(String(g.website_id)) ?? g.website_id})`));
    }
    return { clearedRoots, sharedRoots, otherRoots };
}

function websitesOf(structure: CommerceStoreStructure, chosen: Set<string>, stores: readonly WipeStore[]): WipeScope['websites'] {
    const ids = [...new Set(stores.map((s) => s.website.id))];
    const whole = ids.filter((id) => structure.storeGroups.filter((g) => Number(g.website_id) === id).every((g) => chosen.has(groupKey(g))));
    return { whole, part: ids.filter((id) => !whole.includes(id)) };
}

/**
 * The chosen stores, from the store as it is now.
 *
 * @throws WipeScopeError naming a website or store the store does not have, or when none is named
 */
export function resolveWipeScope(structure: CommerceStoreStructure, choices: readonly WipeStoreChoice[]): WipeScope {
    const groups = chosenGroups(structure, choices);
    const chosen = new Set(groups.map(groupKey));
    const stores = groups.map((g) => storeOf(structure, g));
    return {
        stores,
        viewIds: new Set(stores.flatMap((s) => s.views.map((v) => v.id))),
        websites: websitesOf(structure, chosen, stores),
        ...rootsOf(structure, chosen),
        key: stores.map((s) => `${s.website.code}/${s.code}`).sort().join(','),
    };
}

/** The chosen stores, each named by website and store code: the form a clearing is handed back. */
export function choicesOfScope(scope: WipeScope): WipeStoreChoice[] {
    return scope.stores.map((s) => ({ websiteCode: s.website.code, storeCode: s.code }));
}

/** The store a store view belongs to, on that website: how a project's recorded view names its store. */
export function storeOfView(structure: CommerceStoreStructure, websiteCode: string, viewCode: string): CommerceStoreGroup | undefined {
    const site = structure.websites.find((w) => w.code === websiteCode);
    const view = structure.storeViews.find((v) => v.code === viewCode && String(v.website_id) === String(site?.id));
    return view ? structure.storeGroups.find((g) => String(g.id) === String(view.store_group_id)) : undefined;
}

/**
 * Every website and store to choose from, for the picker and the agent: the chosen ones ticked,
 * and a store another local project records as its own locked with the sentence naming it.
 *
 * @param claims - the refusal sentence for each claimed store, by store id
 */
export function choicesOf(structure: CommerceStoreStructure, scope: WipeScope | undefined, claims: ReadonlyMap<number, string>): WipeChoiceWebsite[] {
    const ticked = new Set(scope?.stores.map((s) => s.id) ?? []);
    return structure.websites.map((site) => ({
        code: site.code,
        name: site.name,
        stores: structure.storeGroups
            .filter((g) => String(g.website_id) === String(site.id))
            .map((g) => {
                const views = structure.storeViews.filter((v) => String(v.store_group_id) === String(g.id)).map((v) => v.name);
                const claimedBy = claims.get(Number(g.id));
                return { code: g.code, name: g.name, views, ticked: ticked.has(Number(g.id)), ...(claimedBy ? { claimedBy } : {}) };
            }),
    }));
}
