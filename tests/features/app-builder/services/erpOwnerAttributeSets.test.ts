/**
 * erpOwnerAttributeSets — which sets the products use lack erp_owner, and the fix and its undo
 * (AB-74). The GET paths and the write's arguments are asserted. Answers are the typed fixtures
 * in tests/helpers/commerceAssignFixtures.ts (Magento's contracts; no live answer recorded).
 */

import { GROUPS, SET_LIST, WITH_OWNER, WITHOUT_OWNER, productSetPage } from '../../../helpers/commerceAssignFixtures';
import {
    addOwnerToSets,
    groupFor,
    readProductSets,
    removeOwnerFromSets,
    setsInWords,
    setsWithoutOwner,
} from '@/features/app-builder/services/erpOwnerAttributeSets';

/** A GET answering by path prefix. */
function commerce(answers: Record<string, unknown>) {
    return jest.fn(async (path: string) => {
        const key = Object.keys(answers).find((prefix) => path.startsWith(prefix));
        if (!key) throw new Error(`unexpected read ${path}`);
        return answers[key];
    });
}

describe('readProductSets', () => {
    it('reads every page with only sku and attribute_set_id', async () => {
        const pages = [productSetPage([['A', 4], ['B', 15]], 3), productSetPage([['C', 4]], 3)];
        const get = jest.fn(async () => pages.shift());
        expect(await readProductSets(get)).toEqual([
            { sku: 'A', attributeSetId: 4 },
            { sku: 'B', attributeSetId: 15 },
            { sku: 'C', attributeSetId: 4 },
        ]);
        expect(get).toHaveBeenCalledWith(
            'products?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&fields=items[sku,attribute_set_id],total_count',
        );
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('refuses to guess when Commerce does not say how many products there are', async () => {
        const get = jest.fn(async () => ({ items: [{ sku: 'A', attribute_set_id: 4 }] }));
        await expect(readProductSets(get)).rejects.toThrow('did not say how many products');
    });
});

describe('setsWithoutOwner', () => {
    it('names the used sets that lack erp_owner, with their product counts, largest first', async () => {
        const get = commerce({
            'products/attribute-sets/sets/list': SET_LIST,
            'products/attribute-sets/4/attributes': WITHOUT_OWNER,
            'products/attribute-sets/15/attributes': WITH_OWNER,
        });
        const missing = await setsWithoutOwner(get, [
            { sku: 'A', attributeSetId: 4 },
            { sku: 'B', attributeSetId: 15 },
            { sku: 'C', attributeSetId: 4 },
        ]);
        expect(missing).toEqual([{ id: 4, name: 'Default', products: 2 }]);
    });

    it('reads nothing for a store with no products', async () => {
        const get = jest.fn();
        expect(await setsWithoutOwner(get, [])).toStrictEqual([]);
        expect(get).not.toHaveBeenCalled();
    });

    it('says the sets in words', () => {
        expect(setsInWords([{ id: 4, name: 'Default', products: 12 }, { id: 9, name: 'Gear', products: 1 }])).toBe(
            'Default (12 products) and Gear (1 product)',
        );
    });
});

describe('the fix and its undo', () => {
    it('puts erp_owner in the Product Details group of each set', async () => {
        const get = commerce({ 'products/attribute-sets/groups/list': GROUPS });
        const send = jest.fn(async () => 7);
        const result = await addOwnerToSets(get, send, [{ id: 4, name: 'Default' }]);
        expect(get).toHaveBeenCalledWith(
            'products/attribute-sets/groups/list?searchCriteria[filter_groups][0][filters][0][field]=attribute_set_id&searchCriteria[filter_groups][0][filters][0][value]=4',
        );
        expect(send).toHaveBeenCalledWith('POST', 'products/attribute-sets/attributes', {
            attributeSetId: 4,
            attributeGroupId: 7,
            attributeCode: 'erp_owner',
            sortOrder: 900,
        });
        expect(result).toEqual({ changed: [{ id: 4, name: 'Default' }] });
    });

    it('falls back to General, then to the first group by sort order', async () => {
        const general = { items: [{ attribute_group_id: 3, attribute_group_name: 'General' }] };
        expect(await groupFor(commerce({ 'products/attribute-sets/groups/list': general }), 4)).toBe(3);
        const other = { items: [{ attribute_group_id: 9, extension_attributes: { sort_order: '5' } }, { attribute_group_id: 2, extension_attributes: { sort_order: '1' } }] };
        expect(await groupFor(commerce({ 'products/attribute-sets/groups/list': other }), 4)).toBe(2);
    });

    it('stops at the first refusal and answers what it had already added', async () => {
        const get = commerce({ 'products/attribute-sets/groups/list': GROUPS });
        const send = jest.fn().mockResolvedValueOnce(7).mockRejectedValueOnce(new Error('Commerce answered 400'));
        const result = await addOwnerToSets(get, send, [{ id: 4, name: 'Default' }, { id: 15, name: 'Bodea Plans' }]);
        expect(result).toEqual({ changed: [{ id: 4, name: 'Default' }], error: 'Bodea Plans: Commerce answered 400' });
    });

    it('takes erp_owner out of each set by its own route', async () => {
        const send = jest.fn(async () => true);
        expect(await removeOwnerFromSets(send, [{ id: 4, name: 'Default' }])).toEqual({ changed: [{ id: 4, name: 'Default' }] });
        expect(send).toHaveBeenCalledWith('DELETE', 'products/attribute-sets/4/attributes/erp_owner', undefined);
    });
});
