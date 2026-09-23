/**
 * Does the connected backend have the business structure the chosen demo's
 * storefront expects? The expected codes are the demo card's configDefaults;
 * the backend's structure is what Business Structure discovered.
 */

import { missingStructure } from '@/features/project-creation/ui/components/businessStructureFit';
import type { CommerceStoreStructure } from '@/types/commerceStore';

const STRUCTURE: CommerceStoreStructure = {
    websites: [{ id: 1, code: 'base', name: 'Main Website' }],
    storeGroups: [{ id: 1, code: 'main_website_store', name: 'Main Store', website_id: 1, root_category_id: 2 }],
    storeViews: [{ id: 1, code: 'default', name: 'Default Store View', store_group_id: 1, website_id: 1, is_active: 1 }],
};

describe('missingStructure', () => {
    it('names each expected code the backend does not have, website first', () => {
        const expected = { ACCS_WEBSITE_CODE: 'adobe', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'usaistore' };

        expect(missingStructure(expected, STRUCTURE)).toStrictEqual(['website adobe', 'store view usaistore']);
    });

    it('reads the PaaS keys when the demo carries only those', () => {
        const expected = { ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal', ADOBE_COMMERCE_STORE_CODE: 'citisignal_store', ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us' };

        expect(missingStructure(expected, STRUCTURE)).toStrictEqual([
            'website citisignal',
            'store citisignal_store',
            'store view citisignal_us',
        ]);
    });

    it('finds nothing missing when the backend has every expected code', () => {
        const expected = { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'default' };

        expect(missingStructure(expected, STRUCTURE)).toStrictEqual([]);
    });

    it('has nothing to compare when the demo expects no codes, or nothing was discovered', () => {
        expect(missingStructure(undefined, STRUCTURE)).toStrictEqual([]);
        expect(missingStructure({}, STRUCTURE)).toStrictEqual([]);
        expect(missingStructure({ ACCS_WEBSITE_CODE: 'adobe' }, undefined)).toStrictEqual([]);
    });
});
