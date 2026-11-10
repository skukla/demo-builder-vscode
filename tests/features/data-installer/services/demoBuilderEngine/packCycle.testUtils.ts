/**
 * The pack and store the full cycle runs (`fullCycle.test.ts`), shared with the suites that measure what
 * an install and a save read on the same store (`recordReuse.test.ts`): one pack holding every REST data
 * type, `memoryStore` with `configStore` beside it for settings, and a context built as the engine
 * builds it (`resolveEngineTarget`, then `sessionFor`).
 */

import { GRID, type configStore, row } from './storeConfig.testUtils';
import { NOW, PACK, PROJECT, type memoryFiles } from './demoBuilderEngine.testUtils';
import type { MemoryStore } from './memoryStore.testUtils';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { resolveEngineTarget, sessionFor } from '@/features/data-installer/services/demoBuilderEngine/installTarget';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import type { PackItems } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type { CommerceGet, CommerceProduct, CommerceSend, CommerceSystemConfigWrite } from '@/types/commerceWire';

export const TARGET = { websiteCode: 'base', storeCode: 'default' };

const SIMPLE: CommerceProduct = {
    sku: 'cycle-tee',
    name: 'Cycle Tee',
    type_id: 'simple',
    attribute_set_id: 'Cycle Gear',
    price: 20,
    status: 1,
    visibility: 4,
    custom_attributes: [
        { attribute_code: 'url_key', value: 'cycle-tee' },
        { attribute_code: 'cycle_material', value: 'Wool' },
        { attribute_code: 'color', value: 'Blue' },
    ],
    extension_attributes: { category_links: [{ category_id: 'cycle-racks', position: 0 }] },
};

const GIFT_CARD: CommerceProduct = {
    sku: 'cycle-gift',
    name: 'Cycle Gift Card',
    type_id: 'giftcard',
    attribute_set_id: 'Default',
    extension_attributes: { giftcard_amounts: [{ value: 25 }] },
};

/** One pack holding every REST data type, each in the shape its parser takes. */
export const PACK_ROWS: PackItems = {
    attribute_sets: [{ attributeSet: { attribute_set_name: 'Cycle Gear' } }],
    product_attributes: [
        {
            attribute: {
                attribute_code: 'cycle_material',
                frontend_input: 'select',
                options: [{ label: 'Cotton' }, { label: 'Wool' }],
            },
        },
        // The store's own attribute, gaining an option: recorded as an attribute_options row.
        {
            attribute: {
                attribute_code: 'color',
                frontend_input: 'select',
                options: [{ label: 'Red' }, { label: 'Blue' }],
            },
        },
    ],
    attribute_assign_to_set: [
        { attributeSetId: 'Cycle Gear', attributeCode: 'cycle_material' },
        // The store's own attribute into the store's own set: taken out on its own, as Luma's were.
        { attributeSetId: 'Default', attributeCode: 'color' },
    ],
    categories: {
        categories: [
            {
                category: {
                    name: 'Cycle Racks',
                    path: 'Default Category',
                    is_active: true,
                    custom_attributes: [{ attribute_code: 'url_key', value: 'cycle-racks' }],
                },
            },
        ],
    },
    customer_groups: [{ customer_group: { code: 'Cycle VIP', tax_class_id: 3 } }],
    stocks: { stocks: [{ stock: { name: 'Cycle Stock' } }] },
    sources: {
        sources: [
            {
                source: {
                    source_code: 'cycle_east',
                    name: 'Cycle East',
                    enabled: true,
                    country_id: 'US',
                    postcode: '10001',
                },
            },
        ],
    },
    stock_source_links: {
        stockSourceLinks: [
            {
                stockSourceLink: {
                    stock_id: 'Cycle Stock',
                    source_code: 'cycle_east',
                    priority: 1,
                },
            },
        ],
    },
    products: [{ product: SIMPLE }],
    giftcards: [{ product: GIFT_CARD }],
    source_items: {
        sourceItems: [{ sku: 'cycle-tee', source_code: 'cycle_east', quantity: 5, status: 1 }],
    },
    customers: [
        {
            customer: {
                email: 'rider@example.com',
                firstname: 'Ada',
                lastname: 'Rider',
                group_id: 'Cycle VIP',
            },
        },
    ],
    cart_rules: [
        {
            rule: {
                name: 'Cycle Ten',
                is_active: true,
                simple_action: 'by_percent',
                discount_amount: 10,
                customer_group_ids: ['Cycle VIP'],
            },
        },
    ],
    coupons: [{ coupon: { code: 'CYCLE10', rule_id: 'Cycle Ten' } }],
    store_config: [row(GRID, '24')],
};


/** Commerce with its settings beside it, as the engine's harness composes them. */
export function commerce(
    store: MemoryStore,
    settings: ReturnType<typeof configStore>
): { get: CommerceGet; send: CommerceSend } {
    return {
        get: (route) =>
            route.startsWith('system/config') ? settings.get(route) : store.get(route),
        send: async (method, route, body, via) => {
            if (route !== 'system/config') return store.send(method, route, body, via);
            store.sent.push({ method, path: route, body });
            return settings.put(body as { items: CommerceSystemConfigWrite[] });
        },
    };
}

/** A fresh context on the same store and record, as each install opens one. */
export async function opened(
    access: { get: CommerceGet; send: CommerceSend },
    files: ReturnType<typeof memoryFiles>,
    logged: string[]
): Promise<KindContext> {
    const session = sessionFor(await resolveEngineTarget(access.get, TARGET));
    const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, TARGET);
    return { ...access, recorder, session, log: (line) => void logged.push(line) };
}
