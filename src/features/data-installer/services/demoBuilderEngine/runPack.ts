/**
 * Install a whole pack, kind by kind in the order the store needs, and remove one from its
 * install record (DI-5).
 *
 * The order is the service's (catalog spec §0): sets before the attributes put in them,
 * categories and stock before the products that name them, products before their quantities.
 * A pack holding a kind this engine cannot install is refused before anything is written, so a
 * half-installed pack is never the answer to "we don't do that kind yet" (`product_export`,
 * `customers_export` and the ACO kinds, today). Customers and B2B
 * (step 08) come after the catalog, in the service's order: groups before the products whose tier
 * prices name them, customers before the companies that make them admins. Store settings (step 09)
 * come last, once the pack's data is in, and are put back first on removal. Gift cards, cart rules
 * and coupons (step 11) sit where the service puts them.
 *
 * Removal walks the record in reverse, dropping each object from it as it goes, so a removal
 * that stops part way can be run again; the record goes once it is empty.
 *
 * @module features/data-installer/services/demoBuilderEngine/runPack
 */

import { installAssignments, installAttributeSets, parseAssignmentRows, parseAttributeSetRows } from './attributeSetsKind';
import { installAttributes, parseAttributeRows } from './attributesKind';
import { ASSIGNMENT_KINDS, CATALOG_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from './b2bKeys';
import { CART_RULE_KIND, installCartRules, parseCartRuleRows } from './cartRulesKind';
import { installCategories, parseCategoryPack } from './categoriesKind';
import { installCompanies, parseCompanyRows } from './companiesKind';
import { COUPON_KIND, installCoupons, parseCouponRows } from './couponsKind';
import { installCustomerGroups, installCustomers, parseCustomerGroupRows, parseCustomerRows } from './customerKinds';
import {
    type RecordFiles,
    forgetInstallRecord,
    openInstallRecord,
    readInstallRecord,
    removalOrder,
} from './installRecord';
import type { KindContext, SettingsDone } from './kindContext';
import { GIFT_CARD_KIND, PRODUCT_KINDS, installProducts, parseProductRows } from './productsKind';
import { recordFingerprints } from './recordFingerprints';
import { type KeptContainer, type RemovalAccess, decideRemovals, takeBack } from './removers';
import { type KeptThing, applyRemovals, applyUpdates, keptOf, ownedFrom, planRepeat } from './repeatInstall';
import { installCatalogs, installAssignments as installCatalogAssignments, parseCatalogRows } from './sharedCatalogKinds';
import { installSourceItems, parseSourceItems } from './sourceItemsKind';
import {
    installSources,
    installStockSourceLinks,
    installStocks,
    parseSources,
    parseStockSourceLinks,
    parseStocks,
} from './stockKinds';
import { STORE_CONFIG_KIND, installStoreConfig, putBackSettings } from './storeConfigKind';
import type { DatapackId } from '@/types/datapack';

/** A pack's rows, by data kind, as its items hold them. */
export type PackItems = Record<string, unknown>;

/** One kind: how its rows are read, and how they are installed. */
interface KindStep {
    kind: string;
    install: (ctx: KindContext, records: unknown) => Promise<void>;
}

/** The kinds this engine installs, in the order it installs them. */
const STEPS: readonly KindStep[] = [
    { kind: 'attribute_sets', install: (ctx, r) => installAttributeSets(ctx, parseAttributeSetRows(r)) },
    { kind: 'product_attributes', install: (ctx, r) => installAttributes(ctx, parseAttributeRows(r)) },
    { kind: 'attribute_assign_to_set', install: (ctx, r) => installAssignments(ctx, parseAssignmentRows(r)) },
    { kind: 'categories', install: (ctx, r) => installCategories(ctx, parseCategoryPack(r)) },
    { kind: CUSTOMER_GROUP_KIND, install: (ctx, r) => installCustomerGroups(ctx, parseCustomerGroupRows(r)) },
    { kind: 'stocks', install: (ctx, r) => installStocks(ctx, parseStocks(r)) },
    { kind: 'sources', install: (ctx, r) => installSources(ctx, parseSources(r)) },
    { kind: 'stock_source_links', install: (ctx, r) => installStockSourceLinks(ctx, parseStockSourceLinks(r)) },
    { kind: 'products', install: (ctx, r) => installProducts(ctx, parseProductRows(r)) },
    // Step 11: gift cards are products, made as products are, after them as the service makes them.
    { kind: GIFT_CARD_KIND, install: (ctx, r) => installProducts(ctx, parseProductRows(r), GIFT_CARD_KIND) },
    { kind: 'source_items', install: (ctx, r) => installSourceItems(ctx, parseSourceItems(r)) },
    // Step 08: customers, then the catalogs and companies, then what is assigned to the catalogs.
    { kind: CUSTOMER_KIND, install: (ctx, r) => installCustomers(ctx, parseCustomerRows(r)) },
    // Step 11: cart rules, then their coupons, in the service's place: after the groups, categories and
    // sets their conditions name, before a shared catalog renames a group the rules name by code.
    { kind: CART_RULE_KIND, install: (ctx, r) => installCartRules(ctx, parseCartRuleRows(r)) },
    { kind: COUPON_KIND, install: (ctx, r) => installCoupons(ctx, parseCouponRows(r)) },
    { kind: CATALOG_KIND, install: (ctx, r) => installCatalogs(ctx, parseCatalogRows(r)) },
    { kind: COMPANY_KIND, install: (ctx, r) => installCompanies(ctx, parseCompanyRows(r)) },
    ...ASSIGNMENT_KINDS.map((kind): KindStep => ({ kind, install: (ctx, r) => installCatalogAssignments(ctx, kind, r) })),
    // Step 09: the pack's store settings, once its data is in.
    { kind: STORE_CONFIG_KIND, install: installStoreConfig },
];

/** The kinds this engine can install, in order. */
export const INSTALLABLE_KINDS: readonly string[] = STEPS.map((step) => step.kind);

/** A pack holds kinds this engine does not install yet; nothing was written. */
export class UnsupportedKindsError extends Error {
    constructor(readonly kinds: string[]) {
        super(`Demo Builder does not install ${kinds.join(', ')} yet, so nothing was installed.`);
        this.name = 'UnsupportedKindsError';
    }
}

/** The pack's kinds this engine cannot install. */
export function unsupportedKinds(items: PackItems): string[] {
    return Object.keys(items).filter((kind) => !INSTALLABLE_KINDS.includes(kind));
}

/** What an install did beyond writing the pack: the SC's own changes it kept. */
export interface InstallOutcome {
    /** What it kept because the SC changed or deleted it in the Admin. */
    kept: KeptThing[];
    /** Containers it did not take out because they hold what the engine did not make. */
    containers: KeptContainer[];
    /** What the store settings kind set and put back (step 09), when the pack holds settings. */
    settings?: SettingsDone;
}

/**
 * Install every kind the pack holds, in order. Installing again brings what this engine made up
 * to the pack, takes out what the pack no longer has, and keeps the SC's own edits
 * (`repeatInstall.ts`); then everything made or changed is read back and hashed.
 *
 * @param onKind - called as each kind starts, for progress
 * @throws UnsupportedKindsError before any write, when the pack holds a kind not listed above
 */
export async function installPack(ctx: KindContext, items: PackItems, onKind: (kind: string) => void = () => undefined): Promise<InstallOutcome> {
    const unsupported = unsupportedKinds(items);
    if (unsupported.length > 0) throw new UnsupportedKindsError(unsupported);
    const plans = await planRepeat(ctx, items, ctx.recorder.created);
    ctx.session.owned = ownedFrom(plans);
    // Hashed means an earlier install finished with it; one that stopped part-way left its
    // products unhashed, and a re-run still sets their quantities.
    ctx.session.productsBefore = new Set(
        ctx.recorder.created.filter((o) => PRODUCT_KINDS.includes(o.kind) && o.fingerprint !== undefined).map((o) => o.id),
    );
    for (const step of STEPS) {
        if (!(step.kind in items)) continue;
        onKind(step.kind);
        await applyUpdates(ctx, plans, step.kind);
        await step.install(ctx, items[step.kind]);
    }
    const containers = await applyRemovals(ctx, plans);
    await recordFingerprints(ctx, items);
    const settings = ctx.session.settings;
    const keptSettings = (settings?.kept ?? []).map((key): KeptThing => ({ kind: STORE_CONFIG_KIND, key }));
    return { kept: [...keptOf(plans), ...keptSettings], containers, ...(settings ? { settings } : {}) };
}

/** What a removal did. */
export interface RemovalResult {
    /** Objects taken back. */
    removed: number;
    /** True when the pack had no record: this engine never installed it here. */
    noRecord: boolean;
    /**
     * Containers the pack made that were kept because they hold what the engine did not make
     * (step 05). They stay on the record, so a later removal takes them once they are empty.
     */
    kept: KeptContainer[];
    /** What putting the pack's store settings back did (step 09), when it had any. */
    settings?: SettingsDone;
}

/**
 * Take back everything the record lists, newest first, dropping each from the record as it
 * goes; keep a container that holds what the engine did not make, and what stays with it
 * (`decideRemovals`, which decides all of it before the first write); delete the record once it
 * is empty. What is kept stays on the record, so the project still names the pack
 * (`leftInStore`, `importJobWatch.ts`).
 *
 * @throws Error naming the object when Commerce refuses one; what was taken back stays off the
 *   record, so running it again carries on from there
 */
export async function removePack(
    commerce: RemovalAccess,
    files: RecordFiles,
    target: { projectPath: string; pack: DatapackId },
): Promise<RemovalResult> {
    const record = await readInstallRecord(files, target.projectPath, target.pack);
    if (!record) return { removed: 0, noRecord: true, kept: [] };
    const recorder = await openInstallRecord(files, target.projectPath, target.pack, () => record.startedAt);
    // Settings first: they went in last. Each leaves the record once put back or kept.
    const settingObjects = record.created.filter((o) => o.kind === STORE_CONFIG_KIND);
    const settings = settingObjects.length > 0 ? await putBackSettings(commerce, settingObjects, (o) => recorder.drop(o)) : undefined;
    const { take, kept } = await decideRemovals(commerce.get, removalOrder(record).filter((o) => o.kind !== STORE_CONFIG_KIND));
    for (const object of take) {
        await takeBack(commerce, object);
        await recorder.drop(object);
    }
    if (kept.length === 0) await forgetInstallRecord(files, target.projectPath, target.pack);
    return { removed: take.length + settingObjects.length, noRecord: false, kept, ...(settings ? { settings } : {}) };
}
