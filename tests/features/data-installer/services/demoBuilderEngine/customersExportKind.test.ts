/**
 * customersExportKind — the Data Installer service's `customers_export` kind installed through Commerce's
 * Import API with the service's substitutions (`config/data_processors_import.json`: `_store`,
 * `_website`, and `group_id` by code), its customers recorded as every customer is.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { installCustomersExport, parseCustomersExport } from '@/features/data-installer/services/demoBuilderEngine/customersExportKind';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const search = (email: string) => page('customers/search', filterBy('email', email));
const lookupGroup = (code: string) =>
    page('customerGroups/search', `&searchCriteria[filterGroups][0][filters][0][field]=customer_group_code&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(code)}`);

const pack = (items: unknown[]) => ({ source: { entity: 'customer_composite', behavior: 'add_update', validationStrategy: 'validation-skip-errors', allowedErrorCount: '10', items } });

async function store() {
    let next = 90;
    const ctx = await fakeContext(
        {
            [search('vip@thelumastory.com')]: { items: [], total_count: 0 },
            [search('kept@example.com')]: { items: [{ id: 7, email: 'kept@example.com', website_id: 6 }], total_count: 1 },
            [lookupGroup('VIP')]: { items: [{ id: 40, code: 'VIP' }] },
        },
        (call) => (call.path === 'customers' ? { id: next++, website_id: 6 } : {}),
    );
    ctx.session.websiteId = 6;
    ctx.session.websiteCode = 'justrite_test_website';
    ctx.session.storeCode = 'justrite_test_store_us';
    return ctx;
}

describe('installCustomersExport', () => {
    it("imports each customer with the target's website and store view and its group's id here, and records it", async () => {
        const ctx = await store();
        const rows = parseCustomersExport(pack([{ email: 'vip@thelumastory.com', _website: 'base', _store: 'default', firstname: 'Sharon', lastname: 'Reynolds', group_id: 'VIP' }]));

        await installCustomersExport(ctx, rows);

        const sent = (ctx.imports[0] as { source: { entity: string; items: Array<Record<string, string>> } }).source;
        expect(sent.entity).toBe('customer_composite');
        expect(sent.items).toEqual([{ email: 'vip@thelumastory.com', _website: 'justrite_test_website', _store: 'justrite_test_store_us', firstname: 'Sharon', lastname: 'Reynolds', group_id: '40' }]);
        expect(ctx.recorder.created).toEqual([{ kind: 'customers', id: '90', key: 'vip@thelumastory.com' }]);
    });

    it('leaves a customer the website already has, and refuses a body that is not customer_composite', async () => {
        const ctx = await store();

        await installCustomersExport(ctx, parseCustomersExport(pack([{ email: 'kept@example.com', firstname: 'K', lastname: 'K' }])));

        expect(ctx.imports).toStrictEqual([]);
        expect(ctx.logged).toContain('left customer kept@example.com as it is: the website already has it');
        expect(() => parseCustomersExport({ source: { entity: 'catalog_product', items: [] } })).toThrow(/customers_export rows are not in the shape/);
    });
});
