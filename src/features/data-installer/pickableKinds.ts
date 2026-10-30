/**
 * What a save from a store can pick (datapack-engine step 14, items 10 and 11), in one place for
 * the webview and the extension: the kinds, in the order a person reads them, and the field a
 * pick names each item by.
 *
 * The picks travel as the service's export `selections` (`{<kind>: {<field>: [ids]}}`,
 * `selectionFilter.js`), so the export screen and `start_datapack_export` send one shape with
 * either engine. The fields are the service's own `id_field`s (`config/data_processors_export.json`),
 * but for an attribute, which Demo Builder's capture names by code.
 *
 * Each kind is one the capture already starts from (`capture.ts`): a picked product brings its
 * categories, set, attributes and quantities; a picked rule its typed-in coupons; a picked company
 * its admin. The kinds left out of the list come along with these (coupons, stock, assignments).
 *
 * @module features/data-installer/pickableKinds
 */

/** The kinds, in the order the screen offers them, and the field each pick is named by. */
export const PICK_FIELDS = {
    products: 'sku',
    giftcards: 'sku',
    categories: 'id',
    cart_rules: 'rule_id',
    customers: 'id',
    b2b_companies: 'id',
    customer_groups: 'id',
    b2b_shared_catalogs: 'id',
    product_attributes: 'attribute_code',
    attribute_sets: 'attribute_set_id',
} as const;

export type PickableKind = keyof typeof PICK_FIELDS;

/** Every pickable kind, in the screen's order. */
export const PICKABLE_KINDS: readonly PickableKind[] = [
    'products',
    'giftcards',
    'categories',
    'cart_rules',
    'customers',
    'b2b_companies',
    'customer_groups',
    'b2b_shared_catalogs',
    'product_attributes',
    'attribute_sets',
];

/** Each kind as a sentence counts it: one, and more than one. */
export const KIND_NOUNS: Readonly<Record<PickableKind, readonly [string, string]>> = {
    products: ['product', 'products'],
    giftcards: ['gift card', 'gift cards'],
    categories: ['category', 'categories'],
    cart_rules: ['cart rule', 'cart rules'],
    customers: ['customer', 'customers'],
    b2b_companies: ['company', 'companies'],
    customer_groups: ['customer group', 'customer groups'],
    b2b_shared_catalogs: ['shared catalog', 'shared catalogs'],
    product_attributes: ['attribute', 'attributes'],
    attribute_sets: ['attribute set', 'attribute sets'],
};

export const isPickableKind = (kind: string): kind is PickableKind => (PICKABLE_KINDS as readonly string[]).includes(kind);

/**
 * The kinds a save says it left out (item 11): what an SC adds by hand in the Admin. The rest
 * (groups, catalogs, attributes, sets) are the store's whole setup, which no demo holds all of.
 */
export const LEFT_OUT_KINDS: readonly PickableKind[] = ['products', 'giftcards', 'categories', 'cart_rules', 'customers', 'b2b_companies'];

/** The ids picked, by kind. */
export type StorePicks = Partial<Record<PickableKind, string[]>>;

/** The service's `selections` shape, which the screen and the agent tool send. */
export type Selections = Record<string, Record<string, Array<string | number>>>;

/** One item of a store a save can pick. */
export interface StoreItem {
    /** What a pick names it by: the kind's field in {@link PICK_FIELDS}. */
    id: string;
    displayName: string;
    /** A quieter word or two: a SKU, an email, a code. */
    detail?: string;
    /** What a pack calls it (`keyOf`): how the save tells it is in the pack already. */
    key: string;
}

/** One kind the store has more of than a saved version holds (item 11): how many, and a few names. */
export interface LeftOut {
    kind: PickableKind;
    count: number;
    names: string[];
}

/** One kind's items, as `list-datapack-export-items` answers with Demo Builder's engine. */
export interface StoreItemPage {
    items: StoreItem[];
    /** How many the store has of the kind, but Commerce's own. */
    totalCount: number;
    /** Commerce's own (the Default set, its five groups, the public catalog), which no pack carries. */
    excludedCount: number;
    /** Left off `items` because the pack being saved holds them already (item 11). */
    inPackCount: number;
}

/** The picks as `selections`, for the request. */
export function selectionsOf(picks: StorePicks): Selections {
    const out: Selections = {};
    for (const kind of PICKABLE_KINDS) {
        const ids = picks[kind] ?? [];
        if (ids.length > 0) out[kind] = { [PICK_FIELDS[kind]]: ids };
    }
    return out;
}

/** `selections` read back into picks, or the sentence that says what is wrong with them. */
export function picksOf(selections: unknown): { picks: StorePicks } | { error: string } {
    if (selections === undefined) return { picks: {} };
    if (typeof selections !== 'object' || selections === null) return { error: 'selections is {<kind>: {<field>: [ids]}}.' };
    const picks: StorePicks = {};
    for (const [kind, filter] of Object.entries(selections)) {
        if (!isPickableKind(kind)) return { error: `${kind} cannot be picked; these can: ${PICKABLE_KINDS.join(', ')}.` };
        const ids = (filter as Record<string, unknown> | null)?.[PICK_FIELDS[kind]];
        if (!Array.isArray(ids)) return { error: `Pick ${kind} by ${PICK_FIELDS[kind]}: {"${kind}": {"${PICK_FIELDS[kind]}": [...]}}.` };
        picks[kind] = ids.map(String);
    }
    return { picks };
}

/** How many items are picked, over every kind. */
export const pickCount = (picks: StorePicks): number => PICKABLE_KINDS.reduce((n, kind) => n + (picks[kind]?.length ?? 0), 0);
