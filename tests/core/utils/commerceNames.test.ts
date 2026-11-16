/**
 * A website, store or store view as the SC knows it: its name, not its code (owner, 2026-11-15).
 */

import { storeNameIn, storeViewNameIn, websiteNameIn } from '@/core/utils/commerceNames';

const STRUCTURE = {
    websites: [
        { id: 6, code: 'justrite_test_website', name: 'Justrite Test', default_group_id: 6 },
    ],
    storeGroups: [
        {
            id: 6,
            code: 'justrite_test_store',
            name: 'Justrite Test Store',
            website_id: 6,
            root_category_id: 2,
            default_store_id: 6,
        },
    ],
    storeViews: [
        {
            id: 6,
            code: 'justrite_test_store_us',
            name: 'US English',
            store_group_id: 6,
            website_id: 6,
            is_active: 1,
        },
        { id: 7, code: 'blank_name', name: '  ', store_group_id: 6, website_id: 6, is_active: 1 },
    ],
};

describe('commerceNames', () => {
    it('names each entity by its name in the store', () => {
        expect(websiteNameIn(STRUCTURE, 'justrite_test_website')).toBe('Justrite Test');
        expect(storeNameIn(STRUCTURE, 'justrite_test_store')).toBe('Justrite Test Store');
        expect(storeViewNameIn(STRUCTURE, 'justrite_test_store_us')).toBe('US English');
    });

    it('falls back to the code when the store has no such entity, or its name is blank', () => {
        expect(websiteNameIn(STRUCTURE, 'gone_website')).toBe('gone_website');
        expect(storeViewNameIn(STRUCTURE, 'blank_name')).toBe('blank_name');
        expect(websiteNameIn(undefined, 'base')).toBe('base');
    });
});
