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

import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
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
