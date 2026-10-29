/**
 * erpAttributesFix — erp_owner and brand as Text Fields, then erp_owner into the attribute
 * sets (AB-77). Asserted on the Commerce fake: which attributes are POSTed with what body,
 * that a pre-existing attribute is never created or deleted, and what the undo refuses.
 */

import { commerceFake, textAttribute } from '../../../../helpers/commercePreparationFixtures';
import { GROUPS, productSetPage, SET_LIST, WITH_OWNER, WITHOUT_OWNER } from '../../../../helpers/commerceAssignFixtures';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { erpAttributesFix, textAttributeBody } from '@/features/app-builder/services/storePreparation/erpAttributesFix';

const missing = (path: string): never => {
    throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
};

/** A store with the given attributes, one product set (Default, 4) lacking erp_owner. */
function store(attributes: Record<string, boolean>, setHasOwner = false, products: Array<{ sku: string; attribute_set_id: number; custom_attributes?: unknown[] }> = []) {
    return commerceFake(
        {
            'products/attributes/erp_owner': (p: string) => (attributes.erp_owner ? textAttribute('erp_owner') : missing(p)),
            'products/attributes/brand': (p: string) => (attributes.brand ? textAttribute('brand') : missing(p)),
            'products/attribute-sets/sets/list': SET_LIST,
            'products/attribute-sets/4/attributes': setHasOwner ? WITH_OWNER : WITHOUT_OWNER,
            'products/attribute-sets/groups/list': GROUPS,
            // The set check reads sku + set; the undo's tagged check reads enabled products in full.
            'products?searchCriteria[currentPage]': (p: string) =>
                p.includes('filter_groups') ? { items: products, total_count: products.length } : productSetPage([['A', 4]]),
        },
        () => null,
    );
}

const DEPS = { websiteCode: 'acme', erpNames: ['Justrite ERP'] };

describe('preview', () => {
    it('names the missing attributes and the sets without erp_owner', async () => {
        const commerce = store({ erp_owner: false, brand: false });
        expect(await erpAttributesFix.preview({ commerce, ...DEPS })).toEqual({
            changes: ['Create the erp_owner product attribute as a Text Field', 'Create the brand product attribute as a Text Field', 'Add erp_owner to the attribute set Default (1 products)'],
        });
    });

    it('lists nothing when both exist and every set has erp_owner', async () => {
        const commerce = store({ erp_owner: true, brand: true }, true);
        expect((await erpAttributesFix.preview({ commerce, ...DEPS })).changes).toStrictEqual([]);
    });
});

describe('apply', () => {
    it('creates only the missing attribute as a Text Field, adds erp_owner to the set, and records both', async () => {
        const commerce = store({ erp_owner: true, brand: false });
        const applied = await erpAttributesFix.apply({ commerce, ...DEPS });
        expect(commerce.writes()).toEqual([
            ['POST', 'products/attributes', textAttributeBody('brand')],
            ['POST', 'products/attribute-sets/attributes', { attributeSetId: 4, attributeGroupId: 7, attributeCode: 'erp_owner', sortOrder: 900 }],
        ]);
        expect(textAttributeBody('brand').attribute).toMatchObject({ attribute_code: 'brand', frontend_input: 'text', is_user_defined: true });
        expect(applied).toEqual({
            // Said as done: the result screen lists these after the run (2026-10-22).
            changes: ['Created the brand product attribute as a Text Field', 'Added erp_owner to the attribute set Default (1 products)'],
            rejected: [],
            record: { kind: 'erp-attributes', createdAttributes: ['brand'], sets: [{ id: 4, name: 'Default' }] },
        });
    });

    it('a refused create is named, and the sets are not touched when erp_owner could not be made', async () => {
        const commerce = store({ erp_owner: false, brand: true });
        commerce.send.mockImplementation(async (_m, path) => {
            if (path === 'products/attributes') throw new Error('Commerce answered 400 for products/attributes: bad');
            return null;
        });
        const applied = await erpAttributesFix.apply({ commerce, ...DEPS });
        expect(applied.rejected).toEqual([
            'Create the erp_owner product attribute as a Text Field: Commerce answered 400 for products/attributes: bad',
            'Add erp_owner to the attribute set Default (1 products): erp_owner was not created',
        ]);
        expect(applied.record).toBeUndefined();
    });
});

describe('undo', () => {
    const RECORD = { kind: 'erp-attributes' as const, createdAttributes: ['brand'], sets: [{ id: 4, name: 'Default' }] };

    it('takes erp_owner out of the recorded sets and deletes only the attribute this run created', async () => {
        const commerce = store({ erp_owner: true, brand: true }, true);
        const undone = await erpAttributesFix.undo({ commerce, ...DEPS }, RECORD);
        expect(commerce.writes()).toEqual([
            ['DELETE', 'products/attribute-sets/4/attributes/erp_owner', undefined],
            ['DELETE', 'products/attributes/brand', undefined],
        ]);
        expect(undone.changes).toEqual(['Took erp_owner out of the attribute set Default', 'Deleted the brand product attribute (Demo Builder created it)']);
    });

    it('refuses while a product in those sets carries an erp_owner value', async () => {
        const commerce = store({ erp_owner: true, brand: true }, true, [
            { sku: 'A', attribute_set_id: 4, custom_attributes: [{ attribute_code: 'erp_owner', value: 'justrite' }] },
        ]);
        const undone = await erpAttributesFix.undo({ commerce, ...DEPS }, RECORD);
        expect(undone.rejected).toEqual([
            "1 product is assigned to Justrite ERP. Undo Justrite ERP's last product assignment first, or the undo would clear them.",
        ]);
        expect(commerce.send).not.toHaveBeenCalled();
    });

    it('names each ERP holding products, with its count, and the value itself for one it cannot name', async () => {
        const tag = (sku: string, owner: string) => ({ sku, attribute_set_id: 4, custom_attributes: [{ attribute_code: 'erp_owner', value: owner }] });
        const commerce = store({ erp_owner: true, brand: true }, true, [tag('A', 'justrite'), tag('B', 'justrite'), tag('C', 'renamed')]);
        const undone = await erpAttributesFix.undo({ commerce, ...DEPS }, RECORD);
        expect(undone.rejected).toEqual([
            "3 products are assigned to Justrite ERP (2) and renamed (1). Undo each ERP's last product assignment first, or the undo would clear them.",
        ]);
    });
});
