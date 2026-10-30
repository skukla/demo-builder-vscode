/**
 * What installing a pack again would change (step 05, owner 2026-10-27; `previewChanges`): for
 * each kind, how many things this engine made would be brought up to the pack, taken out, or kept
 * because the SC changed them, and how many rows are new, with a few names each. Reads only.
 *
 * "Save store changes" is its sibling (`saveStore.ts`); both open the store the same way
 * (`storeAccess.ts`): the project's own signed Commerce client and the install target's ids.
 *
 * @module features/data-installer/services/demoBuilderEngine/storeChanges
 */

import { loadStoreSets } from './attributeSetsKind';
import { CART_RULE_KIND, ruleByName } from './cartRulesKind';
import { COUPON_KIND, couponByCode } from './couponsKind';
import { type CreatedObject, nodeRecordFiles, readInstallRecord } from './installRecord';
import type { KindContext } from './kindContext';
import { placeCategories, rootPlacement } from './packRoot';
import { rootPreview } from './packRootStep';
import { productLookups } from './productLookups';
import { GIFT_CARD_KIND } from './productsKind';
import { containersLine, decideRemovals } from './removers';
import { type KindPlan, type PlannedObject, keptLine, keptOf, ownedFrom, planRepeat, removalsOf } from './repeatInstall';
import { type Named, named } from './saveOutcome';
import { LINK_KIND, SOURCE_KIND, STOCK_KIND } from './stockKinds';
import { type StoreChangesDeps, openStore } from './storeAccess';
import { STORE_CONFIG_KIND, type SettingOutcome, packSettings, planSettings } from './storeConfigKind';
import { onceInventory, readProducts } from './storeCopies';
import { clashLine, placedClashes } from './urlKeyClashes';
import type { Inventory } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What installing again would do to one kind. */
export interface KindChanges {
    kind: string;
    update: Named;
    /** Rows the store lacks: installing adds them. */
    add: Named;
    /**
     * Rows the store already has that this engine did not make: installing leaves them as they
     * are. Told apart for products, gift cards, attributes and sets (which a save then takes into
     * the new version, as it reads them by the pack's own names), for cart rules and coupons (by
     * name and code, step 11) and for sources, stocks and their links
     * (which install uses as they are, `stockKinds.ts`; a switched-off source is switched on, so it
     * counts under `add`). For categories they count under `add`.
     */
    inStore: Named;
    remove: Named;
    keep: Named;
}

/** What installing a pack again would change. */
export interface ChangePreview {
    /** False when Demo Builder never installed the pack here: every row would be new. */
    installed: boolean;
    kinds: KindChanges[];
    /** The one line the install would end with, when it would keep something. */
    kept?: string;
    /**
     * Where the pack's own root would go, when it has one (step 12): under the store's root, or a
     * root of its own with the one Admin step it leaves.
     */
    root?: string;
}

/**
 * Which of these inventory rows the store already has, matched the way install matches them
 * (`stockKinds.ts`): a source by code, and only while switched on; a stock by name; a link by its
 * stock's name and source code.
 */
async function inventoryInStore(inventory: () => Promise<Inventory>, kind: string, keys: string[]): Promise<Set<string>> {
    const { sources, stocks, links } = await inventory();
    const present = new Set<string>();
    if (kind === SOURCE_KIND) for (const s of sources) if (s.enabled !== false) present.add(s.source_code);
    if (kind === STOCK_KIND) for (const s of stocks) present.add(s.name);
    if (kind === LINK_KIND) {
        const nameOf = new Map(stocks.map((s) => [s.stock_id, s.name]));
        for (const l of links) present.add(`${nameOf.get(l.stock_id) ?? ''}/${l.source_code}`);
    }
    return new Set(keys.filter((key) => present.has(key)));
}

const INVENTORY_KINDS = new Set([SOURCE_KIND, STOCK_KIND, LINK_KIND]);

/** Which of these pack rows the store already has, for the kinds told apart (see `inStore`). */
async function alreadyInStore(ctx: KindContext, kind: string, keys: string[], inventory: () => Promise<Inventory>): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    if (INVENTORY_KINDS.has(kind)) return inventoryInStore(inventory, kind, keys);
    if (kind === CART_RULE_KIND || kind === COUPON_KIND) {
        const find = kind === CART_RULE_KIND ? (key: string) => ruleByName(ctx.get, key) : (key: string) => couponByCode(ctx.get, key);
        const present = await Promise.all(keys.map(async (key) => (await find(key)) !== undefined));
        return new Set(keys.filter((_key, i) => present[i]));
    }
    if (kind === 'products' || kind === GIFT_CARD_KIND) {
        // Commerce matches a SKU whatever its case (install's own lookup does too).
        const found = new Set((await readProducts(ctx, keys)).map((p) => p.sku.toLowerCase()));
        return new Set(keys.filter((sku) => found.has(sku.toLowerCase())));
    }
    if (kind === 'product_attributes') {
        const lk = productLookups(ctx);
        const present = await Promise.all(keys.map((code) => lk.attribute(code).then(() => true, () => false)));
        return new Set(keys.filter((_code, i) => present[i]));
    }
    if (kind === 'attribute_sets') {
        await loadStoreSets(ctx);
        return new Set(keys.filter((name) => ctx.session.setIds.has(name)));
    }
    return new Set();
}

const keyOfObject = (object: CreatedObject) => object.key ?? object.id;

/** Counted by kind; `taken` is what the removal would take out, so all else it was asked about stays. */
async function summarize(ctx: KindContext, plans: readonly KindPlan[], taken: readonly CreatedObject[]): Promise<KindChanges[]> {
    const keptHere = (o: PlannedObject) => o.outcome === 'remove' && !taken.includes(o.object);
    const inventory = onceInventory(ctx);
    return Promise.all(
        plans.map(async ({ kind, objects, added }) => {
            const keyed = (test: (o: PlannedObject) => boolean) => objects.filter(test).map((o) => keyOfObject(o.object));
            const there = await alreadyInStore(ctx, kind, added, inventory);
            return {
                kind,
                update: named(keyed((o) => o.outcome === 'update')),
                add: named(added.filter((key) => !there.has(key))),
                inStore: named(added.filter((key) => there.has(key))),
                remove: named(keyed((o) => o.outcome === 'remove' && !keptHere(o))),
                keep: named(keyed((o) => o.outcome === 'leave-edited' || o.outcome === 'create' || keptHere(o))),
            };
        }),
    );
}

/** What installing would do to the pack's store settings (step 09), planned as the install plans them. */
async function settingsChanges(ctx: KindContext, records: unknown, created: readonly CreatedObject[]): Promise<KindChanges> {
    const plan = await planSettings(ctx.get, packSettings(records, ctx.session.websiteCode), created, ctx.session.websiteCode);
    const keys = (...outcomes: SettingOutcome[]) => named(plan.filter((p) => outcomes.includes(p.outcome)).map((p) => p.key));
    return { kind: STORE_CONFIG_KIND, update: keys('update'), add: keys('set', 'unknown-before'), inStore: keys('already'), remove: keys('remove'), keep: keys('kept') };
}

/**
 * What installing the pack again would do, by kind. Writes nothing to the store or the record.
 *
 * @param dataTypes - the kinds to look at; all the pack holds when absent
 */
export async function previewChanges(deps: StoreChangesDeps, pack: DatapackId, source: DatapackStoreName, dataTypes?: string[]): Promise<ChangePreview> {
    const all = await deps.readPack(pack, source);
    const asked = dataTypes ? Object.fromEntries(Object.entries(all).filter(([kind]) => dataTypes.includes(kind))) : all;
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack);
    const ctx = await openStore(deps, pack, record, asked.categories);
    const placement = rootPlacement(asked.categories, record?.created ?? [], ctx.session.storeRoot);
    const items = placeCategories(asked, placement);
    const plans = await planRepeat(ctx, items, record?.created ?? []);
    const scope = { storeRootId: ctx.session.rootCategory.id, created: record?.created ?? [], owned: ownedFrom(plans) };
    const clash = clashLine(await placedClashes(ctx.get, items, placement, scope));
    const root = [rootPreview(placement, asked.categories, ctx.session.storeRoot, record?.rootStep), clash].filter(Boolean).join(' ');
    // The containers an install would keep, decided the way it decides them, read-only.
    const { take, kept: containers } = await decideRemovals(ctx.get, removalsOf(plans));
    const settings = STORE_CONFIG_KIND in items ? await settingsChanges(ctx, items[STORE_CONFIG_KIND], record?.created ?? []) : undefined;
    const keptThings = [...keptOf(plans), ...(settings?.keep.names ?? []).map((key) => ({ kind: STORE_CONFIG_KIND, key }))];
    const kept = [keptLine(keptThings), containersLine(containers)].filter(Boolean).join(' ');
    const kinds = [...(await summarize(ctx, plans, take)), ...(settings ? [settings] : [])];
    return { installed: record !== undefined, kinds, ...(kept ? { kept } : {}), ...(root ? { root } : {}) };
}
