/**
 * What becomes of a create whose answer never came (step 14 item 1, `pendingCreates.ts`): each
 * pending entry is looked for in the store, the same way its kind looks before it creates. Found,
 * the object landed and is the pack's: it goes on the record as if the answer had come, and the
 * next install hashes it like any other. Not found, it never landed and the entry goes.
 *
 * A pending entry is only ever written after its kind looked and found nothing, so what is found
 * now was made by that create (the SC making the same thing in the minutes between is the one case
 * it cannot tell apart, and the one it accepts).
 *
 * An install settles them before it plans anything; a removal settles them before it decides what
 * to take back, so one that landed is removed and one that never did costs nothing.
 *
 * @module features/data-installer/services/demoBuilderEngine/pendingFinders
 */

import { ASSIGNMENT_KIND, ATTRIBUTE_SET_KIND } from './attributeSetsKind';
import { ATTRIBUTE_KIND, ATTRIBUTE_OPTION_KIND } from './attributesKind';
import { CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from './b2bKeys';
import { companyByName, customerByEmail, groupByCode, readCatalogs, readHeld } from './b2bReads';
import { CART_RULE_KIND, ruleByName } from './cartRulesKind';
import { CATEGORY_KIND, findChild } from './categoriesKind';
import { COUPON_KIND, couponByCode } from './couponsKind';
import type { CreatedObject, InstallRecorder, PendingObject } from './installRecord';
import { readOrNull, segment } from './kindContext';
import { GIFT_CARD_KIND, PRODUCT_KIND } from './productsKind';
import { splitPair } from './sharedCatalogKinds';
import { LINK_KIND, SOURCE_KIND, STOCK_KIND } from './stockKinds';
import { STORE_CONFIG_KIND } from './storeConfigKind';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { readPrevious } from '@/features/app-builder/services/storePreparation/configFix';
import { readInventory } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { CommerceAttributeSetList, CommerceGet, CommerceSetAttribute } from '@/types/commerceWire';
import type { CommerceConfigPrevious, SharedCatalogHeld } from '@/types/storePreparation';

/** The object a pending entry made, when the store has it. */
type Finder = (get: CommerceGet, pending: PendingObject) => Promise<CreatedObject | undefined>;

const same = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
const num = (value: string | number | undefined): number | undefined => (value === undefined ? undefined : Number(value));

/** Known by the id it was sent with: there when `exists` says so. */
const byId = (exists: (get: CommerceGet, id: string) => Promise<boolean>, keyed = false): Finder => async (get, p) =>
    p.id !== undefined && (await exists(get, p.id)) ? { kind: p.kind, id: p.id, ...(keyed ? { key: p.key } : {}) } : undefined;

/** Known by a search on its name: the id the store gave it, with the key it is recorded by. */
const byName = (find: (get: CommerceGet, p: PendingObject) => Promise<number | string | undefined>, keyed = true): Finder => async (get, p) => {
    const id = await find(get, p);
    if (id === undefined) return undefined;
    return { kind: p.kind, id: String(id), ...(keyed ? { key: p.key } : {}), ...(p.previous !== undefined ? { previous: p.previous } : {}) };
};

const productThere = async (get: CommerceGet, sku: string) => (await readOrNull(get, `products/${encodeURIComponent(sku)}`)) !== null;

const HELD_LIST: Record<string, keyof SharedCatalogHeld> = {
    [CATALOG_COMPANIES_KIND]: 'companies',
    [CATALOG_CATEGORIES_KIND]: 'categories',
    [CATALOG_PRODUCTS_KIND]: 'products',
};

const assignedThere = (kind: string) => async (get: CommerceGet, id: string) => {
    const { catalogId, ref } = splitPair(id);
    return (await readHeld(get, Number(catalogId)))[HELD_LIST[kind]].map(String).includes(ref);
};

/** A setting landed when the store now holds the value written. */
const settingLanded: Finder = async (get, p) => {
    const previous = p.previous as CommerceConfigPrevious | undefined;
    if (!previous?.wrote) return undefined;
    const [now] = await readPrevious(get, [{ path: previous.path, scope: previous.scope }], previous.scopeCode);
    return now?.effective === previous.wrote ? { kind: p.kind, id: p.key, key: p.key, previous } : undefined;
};

const FINDERS: Record<string, Finder> = {
    [ATTRIBUTE_SET_KIND]: byName(async (get, p) => {
        const sets = await readAllPages<NonNullable<CommerceAttributeSetList['items']>[number]>(get, 'products/attribute-sets/sets/list');
        return sets.find((s) => s.attribute_set_name === p.key)?.attribute_set_id;
    }, false),
    [ATTRIBUTE_KIND]: byId(async (get, code) => (await readOrNull(get, `products/attributes/${segment(code)}`)) !== null),
    [ATTRIBUTE_OPTION_KIND]: byName(async (get, p) => {
        const slash = p.key.indexOf('/');
        const [code, label] = [p.key.slice(0, slash), p.key.slice(slash + 1)];
        const options = ((await readOrNull<Array<{ label?: string; value?: string }>>(get, `products/attributes/${segment(code)}/options`)) ?? []);
        const value = options.find((o) => same(o.label, label))?.value;
        return value ? `${code}/${value}` : undefined;
    }, false),
    [ASSIGNMENT_KIND]: byId(async (get, id) => {
        const [setId, code] = id.split('/');
        const attributes = ((await readOrNull<CommerceSetAttribute[]>(get, `products/attribute-sets/${segment(setId)}/attributes`)) ?? []);
        return attributes.some((a) => a.attribute_code === code);
    }),
    [CATEGORY_KIND]: byName(async (get, p) => {
        const parentId = num(p.find?.parentId);
        return parentId === undefined ? undefined : findChild(get, parentId, String(p.find?.name ?? ''));
    }, false),
    [CUSTOMER_GROUP_KIND]: byName(async (get, p) => (await groupByCode(get, p.key))?.id),
    [CUSTOMER_KIND]: byName(async (get, p) => (await customerByEmail(get, p.key, num(p.find?.websiteId)))?.id),
    [STOCK_KIND]: byName(async (get, p) => (await readInventory(get)).stocks.find((s) => s.name === p.key)?.stock_id, false),
    // Made, it is there; switched back on, it is there and on.
    [SOURCE_KIND]: async (get, p) => {
        const source = (await readInventory(get)).sources.find((s) => s.source_code === p.key);
        if (!source || (p.previous !== undefined && source.enabled === false)) return undefined;
        return { kind: p.kind, id: p.key, ...(p.previous !== undefined ? { previous: p.previous } : {}) };
    },
    [LINK_KIND]: byId(async (get, id) => {
        const slash = id.indexOf('/');
        return (await readInventory(get)).links.some((l) => String(l.stock_id) === id.slice(0, slash) && l.source_code === id.slice(slash + 1));
    }),
    [PRODUCT_KIND]: byId(productThere),
    [GIFT_CARD_KIND]: byId(productThere),
    [CART_RULE_KIND]: byName(async (get, p) => (await ruleByName(get, p.key))?.rule_id),
    [COUPON_KIND]: byName(async (get, p) => (await couponByCode(get, p.key))?.coupon_id),
    [CATALOG_KIND]: async (get, p) => {
        const id = (await readCatalogs(get)).find((c) => c.name === p.key)?.id;
        if (id === undefined) return undefined;
        const held = await readHeld(get, id).catch(() => undefined);
        return { kind: p.kind, id: String(id), key: p.key, ...(held ? { previous: { held } } : {}) };
    },
    [COMPANY_KIND]: byName(async (get, p) => (await companyByName(get, p.key, p.find?.email === undefined ? undefined : String(p.find.email)))?.id),
    ...Object.fromEntries(Object.keys(HELD_LIST).map((kind): [string, Finder] => [kind, byId(assignedThere(kind), true)])),
    [STORE_CONFIG_KIND]: settingLanded,
};

/** The kinds a pending entry can be settled for: every kind the engine creates. */
export const SETTLED_KINDS: readonly string[] = Object.keys(FINDERS);

/**
 * Settle every pending entry the record holds: record what landed as the pack's, drop the rest.
 *
 * @returns the objects that landed and are now on the record
 * @throws Error naming the kind when the record holds a pending entry no finder reads (the record
 *   was written by a later version), and whatever a read throws: an install or removal then stops
 */
export async function settlePending(get: CommerceGet, recorder: InstallRecorder, log: (line: string) => void): Promise<CreatedObject[]> {
    const adopted: CreatedObject[] = [];
    for (const pending of [...recorder.pending]) {
        const find = FINDERS[pending.kind];
        if (!find) throw new Error(`The install record lists a ${pending.kind} still being made, which Demo Builder cannot look for.`);
        const found = await find(get, pending);
        if (found) {
            await recorder.confirm([pending], [found]);
            adopted.push(found);
            log(`took ${pending.kind} ${pending.key} as the pack's: an earlier install made it and never heard back`);
        } else {
            await recorder.forgetPending([pending]);
            log(`${pending.kind} ${pending.key} was never made: an earlier install sent it and never heard back`);
        }
    }
    return adopted;
}
