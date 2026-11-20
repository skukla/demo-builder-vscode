/**
 * A cart rule's condition trees, both ways (datapack-engine step 11): option labels of a select
 * attribute the SC made turn into this store's option ids and back; anything the store does not
 * describe as an option attribute (Commerce's own cart fields, a SKU, a text attribute) is sent as
 * it is. Attributes are typed to `StoreAttribute`; none is a captured answer.
 */

import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { conditionsForPack, conditionsForStore, namesSegment } from '@/features/data-installer/services/demoBuilderEngine/ruleConditions';
import type { CommerceRuleCondition } from '@/types/commerceSalesRule';
import { MILE_SERVICE, WIPER_FLUID } from '../../../../helpers/commerceSalesRuleFixtures';
import { fakeContext } from './demoBuilderEngine.testUtils';

const PRODUCT = 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product';
const tree = (...conditions: CommerceRuleCondition[]): CommerceRuleCondition => ({
    condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine',
    conditions,
    aggregator_type: 'all',
    operator: null,
    value: '1',
});
const BRAND = { attribute_id: 180, attribute_code: 'brand', frontend_input: 'select', is_user_defined: true, options: [{ label: 'Acme', value: '14' }, { label: 'Zed', value: '15' }] };

describe('ruleConditions', () => {
    it("turns a select attribute's labels into this store's option ids, and back", async () => {
        const ctx = await fakeContext({ 'products/attributes/brand': BRAND });
        const lk = productLookups(ctx);

        const stored = await conditionsForStore(lk, tree({ condition_type: PRODUCT, operator: '()', attribute_name: 'brand', value: 'Acme, Zed' }));
        const packed = await conditionsForPack(lk, stored);

        expect(stored.conditions?.[0].value).toBe('14,15');
        expect(packed.conditions?.[0].value).toBe('Acme,Zed');
    });

    it("sends Commerce's own cart fields and SKUs as they are, reading nothing it need not", async () => {
        const ctx = await fakeContext({});
        const node = tree(
            { condition_type: PRODUCT, operator: '>=', attribute_name: 'quote_item_qty', value: '2' },
            { condition_type: PRODUCT, operator: '==', attribute_name: 'sku', value: '53081' },
        );

        expect(await conditionsForStore(productLookups(ctx), node)).toEqual(node);
    });

    it('stops on a category url key the store does not have, as every lookup does', async () => {
        const ctx = await fakeContext({ 'categories/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&searchCriteria[filterGroups][0][filters][0][field]=url_key&searchCriteria[filterGroups][0][filters][0][value]=nowhere': { items: [], total_count: 0 } });

        await expect(conditionsForStore(productLookups(ctx), tree({ condition_type: PRODUCT, operator: '==', attribute_name: 'category_ids', value: 'nowhere' }))).rejects.toThrow('no category with the url key nowhere');
    });

    it('finds a customer segment anywhere in a tree', () => {
        expect(namesSegment(MILE_SERVICE.rule.condition)).toBe(true);
        expect(namesSegment(WIPER_FLUID.rule.condition)).toBe(false);
    });
});
