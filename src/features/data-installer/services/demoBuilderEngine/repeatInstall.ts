/**
 * Installing a pack again (step 05, owner 2026-10-27): the pack changes and the store follows,
 * but only for what this engine made, and never over an SC's own edit.
 *
 * For every object the install record lists, of a kind the request installs, three hashes go to
 * the one rule (`decideOwnedChange`, `core/utils/ownedChange`): the store's copy as it was
 * written (`fingerprint`), the store's copy now, and what the pack wants. "What the pack wants"
 * is the store's copy now when the pack's row is the one installed (`wrote`), so an unchanged
 * row asks for nothing; a pack row and a store answer never match field for field, so comparing
 * them directly would update every object on every install.
 *
 * | The rule answers | What happens |
 * |---|---|
 * | `update` | the object is brought up to the pack's row |
 * | `remove` | the pack no longer has it: taken out, after every kind is installed, newest first |
 * | `leave-edited` | the SC changed it: kept, and counted in the one line |
 * | `create` | the SC deleted it: kept deleted, counted, and left on the record so it stays so |
 * | `unchanged`, `gone` | nothing; a `gone` object leaves the record |
 * | `leave-not-ours` | recorded before hashes were kept: left alone this once, hashed from now on |
 *
 * A container that would take the SC's own things with it is kept too: a category with a
 * category in it, or an attribute set with products in it, that this engine did not make
 * (`decideRemovals` in `removers.ts`, which a whole-pack removal and the preview use as well).
 *
 * @module features/data-installer/services/demoBuilderEngine/repeatInstall
 */

import { addMissingOptions, parseAttributeRows } from './attributesKind';
import { updateCompany } from './companiesKind';
import { updateCustomer, updateCustomerGroup } from './customerKinds';
import { fingerprintRow } from './fingerprint';
import type { CreatedObject } from './installRecord';
import { type KindContext, ownedKey, segment } from './kindContext';
import { productLookups } from './productLookups';
import { parseProductRows, toCommerceProduct } from './productsKind';
import { type KeptContainer, decideRemovals, takeBack } from './removers';
import { READABLE_KINDS, packKindOf, packedFingerprint, readCopies, rowsByKey } from './storeCopies';
import { type OwnedChange, decideOwnedChange } from '@/core/utils/ownedChange';

/** What becomes of one recorded object. `create` from the rule means the SC deleted it. */
export interface PlannedObject {
    object: CreatedObject;
    outcome: OwnedChange;
    /** The pack's row for it, when the pack still has one. */
    row?: unknown;
}

/** One recorded kind's objects, and the pack's rows of that kind no object was made for yet. */
export interface KindPlan {
    kind: string;
    objects: PlannedObject[];
    added: string[];
}

/** Something kept because the SC had changed it, by kind and the pack's name for it. */
export interface KeptThing {
    kind: string;
    key: string;
}

type Items = Record<string, unknown>;
type Row = Record<string, unknown>;

/** What the pack wants of a recorded object, as the rule takes it (see the module comment). */
function wantedOf(kind: string, object: CreatedObject, row: unknown, current: string | undefined): string | undefined {
    if (row === undefined) return undefined;
    const packed = packedFingerprint(kind, row);
    return packed === object.wrote && current !== undefined ? current : packed;
}

async function planKind(ctx: KindContext, kind: string, objects: CreatedObject[], records: unknown): Promise<KindPlan> {
    const copies = await readCopies(ctx, productLookups(ctx), kind, objects);
    const rows = rowsByKey(kind, records);
    const planned = objects.map((object): PlannedObject => {
        const row = object.key === undefined ? undefined : rows.get(object.key);
        if (object.key === undefined || object.fingerprint === undefined) return { object, outcome: 'leave-not-ours', row };
        const copy = copies.get(object.id);
        const current = copy === undefined ? undefined : fingerprintRow(copy);
        const outcome = decideOwnedChange({ recorded: object.fingerprint, current, wanted: wantedOf(kind, object, row, current) });
        return { object, outcome, row };
    });
    const known = new Set(objects.map((o) => o.key).filter((k): k is string => k !== undefined));
    return { kind, objects: planned, added: [...rows.keys()].filter((key) => !known.has(key)) };
}

/**
 * What installing the pack again would do to everything this engine made, kind by kind, for the
 * kinds the request installs. Reads only.
 */
export async function planRepeat(ctx: KindContext, items: Items, created: readonly CreatedObject[]): Promise<KindPlan[]> {
    const plans: KindPlan[] = [];
    for (const kind of READABLE_KINDS) {
        const packKind = packKindOf(kind);
        if (!(packKind in items)) continue;
        plans.push(await planKind(ctx, kind, created.filter((o) => o.kind === kind), items[packKind]));
    }
    return plans;
}

/** The ids a kind's install should use for the pack's rows, and the ones the SC deleted. */
export function ownedFrom(plans: readonly KindPlan[]): Map<string, string | null> {
    const owned = new Map<string, string | null>();
    for (const { kind, objects } of plans) {
        for (const { object, outcome } of objects) {
            if (object.key !== undefined) owned.set(ownedKey(kind, object.key), outcome === 'create' ? null : object.id);
        }
    }
    return owned;
}

type Updater = (ctx: KindContext, object: CreatedObject, row: unknown) => Promise<void>;

const UPDATERS: Record<string, Updater> = {
    products: async (ctx, object, row) => {
        if (ctx.session.websiteId === undefined) throw new Error('The install target names no website, so the pack\'s products have nowhere to be sold.');
        const [product] = parseProductRows([row]);
        const { stock_item: _stock, ...ext } = (product.extension_attributes ?? {}) as Row;
        // Quantities are the source items' business; a stock block would reset them.
        const body = await toCommerceProduct(productLookups(ctx), { ...product, extension_attributes: ext }, ctx.session.websiteId);
        await ctx.send('PUT', `products/${encodeURIComponent(object.id)}`, body);
    },
    categories: async (ctx, object, row) => {
        // Its place in the tree stays as it is: a moved category would be another row.
        const { id: _id, parent_id: _parent, path: _path, ...fields } = (row as { category: Row }).category;
        await ctx.send('PUT', `categories/${segment(object.id)}`, { category: { ...fields, id: Number(object.id) } });
    },
    sources: async (ctx, object, row) => {
        await ctx.send('PUT', `inventory/sources/${segment(object.id)}`, { source: (row as { source: Row }).source });
    },
    product_attributes: async (ctx, object, row) => {
        const [attribute] = parseAttributeRows([row]);
        await addMissingOptions(ctx, object.id, attribute.attribute.options ?? []);
    },
    // Step 08: a group whole; a customer and a company over the store's own copy.
    customer_groups: (ctx, object, row) => updateCustomerGroup(ctx, object.id, row),
    customers: (ctx, object, row) => updateCustomer(ctx, object.id, row),
    b2b_companies: (ctx, object, row) => updateCompany(ctx, object.id, row),
};

/**
 * Bring what this engine made of one pack kind up to the pack, before that kind's install adds
 * what is new. Each updated object's store hash is cleared, to be read again once the install
 * ends (`recordFingerprints`), and its pack hash moves to the row it now matches.
 */
export async function applyUpdates(ctx: KindContext, plans: readonly KindPlan[], packKind: string): Promise<void> {
    for (const plan of plans.filter((p) => packKindOf(p.kind) === packKind)) {
        const update = UPDATERS[plan.kind];
        for (const { object, outcome, row } of plan.objects) {
            if (outcome !== 'update' || !update) continue;
            await update(ctx, object, row);
            await ctx.recorder.update({ kind: object.kind, id: object.id, fingerprint: undefined, wrote: packedFingerprint(plan.kind, row) });
            ctx.log(`brought ${object.kind} ${object.key ?? object.id} up to the pack`);
        }
    }
}

/** Install order, so removal can run it backwards. */
const ORDER = [
    'attribute_sets', 'product_attributes', 'attribute_options', 'attribute_assign_to_set', 'categories', 'customer_groups',
    'stocks', 'sources', 'stock_source_links', 'products', 'customers', 'b2b_shared_catalogs', 'b2b_companies',
    'b2b_shared_catalog_company_assignments', 'b2b_shared_catalog_categories', 'b2b_shared_catalog_products',
];

/**
 * What installing again would take out, newest kind first and newest first within a kind, so a
 * product goes before the set and the category it sat in, and a child category before its parent.
 */
export function removalsOf(plans: readonly KindPlan[]): CreatedObject[] {
    const ordered = [...plans].sort((a, b) => ORDER.indexOf(b.kind) - ORDER.indexOf(a.kind));
    return ordered.flatMap((plan) => [...plan.objects].reverse().filter((o) => o.outcome === 'remove').map((o) => o.object));
}

/**
 * Take out what the pack no longer has, keeping a category or set that holds what this engine
 * did not make (`decideRemovals`, the rule a whole-pack removal applies too), and drop from the
 * record what is gone from both.
 *
 * @returns the containers kept
 */
export async function applyRemovals(ctx: KindContext, plans: readonly KindPlan[]): Promise<KeptContainer[]> {
    for (const { object } of plans.flatMap((p) => p.objects).filter((o) => o.outcome === 'gone')) await ctx.recorder.drop(object);
    const { take, kept } = await decideRemovals(ctx.get, removalsOf(plans));
    for (const object of take) {
        await takeBack(ctx, object);
        await ctx.recorder.drop(object);
        ctx.log(`took out ${object.kind} ${object.key ?? object.id}: the pack no longer has it`);
    }
    return kept;
}

/** What the plan keeps because the SC changed or deleted it. */
export function keptOf(plans: readonly KindPlan[]): KeptThing[] {
    return plans.flatMap(({ kind, objects }) =>
        objects.filter((o) => o.outcome === 'leave-edited' || o.outcome === 'create').map((o) => ({ kind, key: o.object.key ?? o.object.id })),
    );
}

/** The one line a repeat install says about what it kept, or nothing when it kept nothing. */
export function keptLine(kept: readonly KeptThing[]): string | undefined {
    if (kept.length === 0) return undefined;
    return `Kept ${kept.length} ${kept.length === 1 ? 'thing' : 'things'} you had changed in the Admin.`;
}
