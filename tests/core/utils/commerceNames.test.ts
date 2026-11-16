/**
 * A website, store or store view as the SC knows it: its name, not its code (owner, 2026-11-15).
 */

import { readWebsiteName, storeNameIn, storeViewNameIn, websiteNameIn } from '@/core/utils/commerceNames';

const STRUCTURE = {
    websites: [
        { id: 6, code: 'tailspin_test_website', name: 'Tailspin Test', default_group_id: 6 },
    ],
    storeGroups: [
        {
            id: 6,
            code: 'tailspin_test_store',
            name: 'Tailspin Test Store',
            website_id: 6,
            root_category_id: 2,
            default_store_id: 6,
        },
    ],
    storeViews: [
        {
            id: 6,
            code: 'tailspin_test_store_us',
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
        expect(websiteNameIn(STRUCTURE, 'tailspin_test_website')).toBe('Tailspin Test');
        expect(storeNameIn(STRUCTURE, 'tailspin_test_store')).toBe('Tailspin Test Store');
        expect(storeViewNameIn(STRUCTURE, 'tailspin_test_store_us')).toBe('US English');
    });

    it('falls back to the code when the store has no such entity, or its name is blank', () => {
        expect(websiteNameIn(STRUCTURE, 'gone_website')).toBe('gone_website');
        expect(storeViewNameIn(STRUCTURE, 'blank_name')).toBe('blank_name');
        expect(websiteNameIn(undefined, 'base')).toBe('base');
    });
});

describe('readWebsiteName', () => {
    it("reads the website's name from the store, and the code when the store cannot answer", async () => {
        const answering = jest.fn(async () => STRUCTURE.websites);
        const failing = jest.fn(async () => {
            throw new Error('HTTP 503');
        });

        await expect(readWebsiteName(answering, 'tailspin_test_website')).resolves.toBe('Tailspin Test');
        expect(answering).toHaveBeenCalledWith('store/websites');
        await expect(readWebsiteName(failing, 'tailspin_test_website')).resolves.toBe('tailspin_test_website');
        await expect(readWebsiteName(answering, undefined)).resolves.toBeUndefined();
    });
});
