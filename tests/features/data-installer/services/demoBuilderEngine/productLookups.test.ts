/**
 * Every name-to-id lookup runs both ways (step 05): install turns a pack's names into this
 * store's ids, capture turns the store's ids back into names, so a captured pack installs
 * anywhere. Each field's two directions share one read of the store.
 *
 * Shapes: the set list and the attribute are the routes the engine already reads
 * (`commerceWire.ts`); a category is `GET categories/{id}`, the read the service's own export
 * uses for the same reverse lookup (export spec §2), and its fields here are Magento's
 * `CategoryInterface`, not a recorded answer.
 */

import { ambiguousKeysLine, productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { by, fakeContext, page } from './demoBuilderEngine.testUtils';

const SETS = { [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 4, attribute_set_name: 'Default' }, { attribute_set_id: 12, attribute_set_name: 'Bodea Racks' }], total_count: 2 } };

describe('productLookups, both directions', () => {
    it('turns an attribute set name into its id and the id back into the name, from one read', async () => {
        let reads = 0;
        const ctx = await fakeContext({ [Object.keys(SETS)[0]]: () => ((reads += 1), Object.values(SETS)[0]) });
        const lk = productLookups(ctx);

        await expect(lk.setId('Bodea Racks')).resolves.toBe(12);
        await expect(lk.setName(12)).resolves.toBe('Bodea Racks');
        expect(reads).toBe(1);
    });

    it('answers no name for a set the store does not have, so capture keeps the id', async () => {
        const lk = productLookups(await fakeContext(SETS));

        await expect(lk.setName(99)).resolves.toBeUndefined();
    });

    it('turns a category id back into its url key', async () => {
        const ctx = await fakeContext({
            'categories/41': { id: 41, name: 'Racks', parent_id: 2, path: '1/2/41', custom_attributes: [{ attribute_code: 'url_key', value: 'racks' }] },
        });

        await expect(productLookups(ctx).categoryUrlKey('41')).resolves.toBe('racks');
        await expect(productLookups(ctx).categoryUrlKey('42')).resolves.toBeUndefined();
    });

    it('turns an option id back into its label, and an attribute id back into its code', async () => {
        const ctx = await fakeContext({
            'products/attributes/cable_size': { attribute_id: 140, frontend_input: 'select', options: [{ label: ' ', value: '' }, { label: '6 foot', value: '61' }] },
            [page('products/attributes', by('attribute_id', '140'))]: { items: [{ attribute_id: 140, attribute_code: 'cable_size' }], total_count: 1 },
        });
        const lk = productLookups(ctx);

        await expect(lk.optionLabel('cable_size', '61')).resolves.toBe('6 foot');
        await expect(lk.optionLabel('cable_size', '62')).resolves.toBeUndefined();
        await expect(lk.attributeCode('140')).resolves.toBe('cable_size');
    });

    // Step 08: Bodea's customers name "Default (General)"; a store may call that group "General".
    // The service aliases the two both ways; so does this.
    it('finds a group under its other spelling when the store has none under the one the pack gives', async () => {
        const search = (code: string) => page('customerGroups/search', by('customer_group_code', code));
        const ctx = await fakeContext({
            [search('Default (General)')]: { items: [] },
            [search('General')]: { items: [{ id: 1, code: 'General' }] },
            [search('Guest')]: { items: [] },
            [search('NOT LOGGED IN')]: { items: [{ id: 0, code: 'NOT LOGGED IN' }] },
        });

        await expect(productLookups(ctx).groupId('Default (General)')).resolves.toBe(1);
        await expect(productLookups(ctx).groupId('General')).resolves.toBe(1);
        await expect(productLookups(ctx).groupId('NOT LOGGED IN')).resolves.toBe(0);
    });

    it('turns a customer group id back into its code', async () => {
        const ctx = await fakeContext({ 'customerGroups/5': { id: 5, code: 'Platinum Buyer' } });

        await expect(productLookups(ctx).groupCode(5)).resolves.toBe('Platinum Buyer');
    });

    it('turns a product id back into its SKU, kept exactly as the store holds it', async () => {
        const ctx = await fakeContext({
            [page('products', by('entity_id', '7'))]: { items: [{ id: 7, sku: 'OutdoorPatchCable/6ft' }], total_count: 1 },
        });

        await expect(productLookups(ctx).productSku(7)).resolves.toBe('OutdoorPatchCable/6ft');
    });
});

/**
 * DI-9: a pack names a product's categories by url key alone, and Commerce lets a child reuse its
 * parent's key. Bodea's "Servers and Racks" and its child "Racks" are both `racks` (measured on the
 * shared library's pack, 2026-10-30). Everything linking the key goes into the first match; the
 * install now says so instead of choosing in silence. Shapes: `categories/list` items are Magento's
 * `CategoryInterface` (`id`, `name`, `path`), as `categoryUrlKey` above reads them.
 */
describe('a url key two categories share', () => {
    const list = page('categories/list', by('url_key', 'racks'));
    const SERVERS = { id: 40, name: 'Servers and Racks', path: '1/2/40' };
    const RACKS = { id: 41, name: 'Racks', path: '1/2/40/41' };

    it('takes the first match under the root, and records the key, both names and where it went', async () => {
        const ctx = await fakeContext({ [list]: { items: [SERVERS, RACKS], total_count: 2 } });

        await expect(productLookups(ctx).categoryId('racks')).resolves.toBe('40');
        expect(ctx.session.ambiguousCategoryKeys?.get('racks')).toEqual({ chosen: 'Servers and Racks', names: ['Servers and Racks', 'Racks'] });
    });

    it('records nothing for a key one category holds — control', async () => {
        const ctx = await fakeContext({ [list]: { items: [RACKS], total_count: 1 } });

        await expect(productLookups(ctx).categoryId('racks')).resolves.toBe('41');
        expect(ctx.session.ambiguousCategoryKeys).toBeUndefined();
    });

    it('counts only the matches under the root when some are elsewhere', async () => {
        const elsewhere = { id: 90, name: 'Racks', path: '1/80/90' };
        const ctx = await fakeContext({ [list]: { items: [elsewhere, RACKS], total_count: 2 } });

        await expect(productLookups(ctx).categoryId('racks')).resolves.toBe('41');
        expect(ctx.session.ambiguousCategoryKeys).toBeUndefined();
    });

    it('says it on the install result in one sentence a key', () => {
        const keys = new Map([['racks', { chosen: 'Servers and Racks', names: ['Servers and Racks', 'Racks'] }]]);

        expect(ambiguousKeysLine(keys)).toBe(
            'The url key racks names 2 categories (Servers and Racks, Racks), so everything linking it went into Servers and Racks.',
        );
        expect(ambiguousKeysLine(new Map())).toBeUndefined();
        expect(ambiguousKeysLine(undefined)).toBeUndefined();
    });
});
