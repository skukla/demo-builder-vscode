/**
 * A fake of the reads a wipe makes (step 10), answering from the typed sandbox in
 * `tests/helpers/commerceWipeFixtures.ts`, filtering a search by the `website_id` its address names
 * as Commerce would. Every read's address and every write are kept, so a suite asserts both.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceCustomer, CommerceProduct } from '@/types/commerceWire';
import { SANDBOX_CATEGORIES, SANDBOX_GROUPS, SANDBOX_WEBSITES, TEST_SITE_CUSTOMERS, TEST_SITE_PRODUCTS } from '../../../../helpers/commerceWipeFixtures';

const WEBSITE_FILTER = /searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[field\]=website_id&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=(\d+)/u;

export interface SandboxState {
    products: CommerceProduct[];
    customers: CommerceCustomer[];
}

export function sandbox(state: Partial<SandboxState> = {}, refuse: (path: string) => boolean = () => false) {
    const data: SandboxState = { products: state.products ?? [...TEST_SITE_PRODUCTS], customers: state.customers ?? [...TEST_SITE_CUSTOMERS] };
    const reads: string[] = [];
    const sent: Array<{ method: string; path: string }> = [];
    const page = <T>(items: T[]) => ({ items, total_count: items.length });
    const website = (path: string) => Number(WEBSITE_FILTER.exec(path)?.[1]);
    const get = async (path: string): Promise<unknown> => {
        reads.push(path);
        if (path === 'store/websites') return SANDBOX_WEBSITES;
        if (path === 'store/storeGroups') return SANDBOX_GROUPS;
        if (path.startsWith('categories/list?')) return page(SANDBOX_CATEGORIES);
        if (path.startsWith('products?')) return page(data.products.filter((p) => p.extension_attributes?.website_ids?.map(Number).includes(website(path))));
        // Answers every customer, as if the filter were ignored: the wipe must still take only this website's.
        if (path.startsWith('customers/search?')) return page(data.customers);
        throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
    };
    const send = async (method: 'POST' | 'PUT' | 'DELETE', path: string): Promise<unknown> => {
        sent.push({ method, path });
        if (refuse(path)) throw new CommerceReadError('Commerce answered 400: The product is in use.', 400);
        return true;
    };
    return { data, reads, sent, get, send };
}

/** This project's records: Demo Builder made one product, one customer and one category. */
export const PROJECT_RECORDS: InstallRecord[] = [
    {
        format: 1,
        pack: { name: 'zz-test', version: '1' },
        engine: 'demo-builder',
        startedAt: '2026-10-30T10:00:00.000Z',
        target: { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' },
        created: [
            { kind: 'products', id: 'ZZ-MADE-BY-DEMO-BUILDER' },
            { kind: 'customers', id: '72' },
            { kind: 'categories', id: '155' },
        ],
    },
];
