/**
 * Where a pack lands: the project's chosen website and store view, as this store's ids, read
 * through `storeScopeOf` (DI-5). Websites are the Bodea sandbox's own (`websites.json`, captured
 * 2026-09-27); groups and views are shaped as Commerce's store routes answer them.
 */

import fs from 'fs';
import path from 'path';
import {
    InstallTargetError,
    resolveEngineTarget,
    sessionFor,
} from '@/features/data-installer/services/demoBuilderEngine/installTarget';

const websites = (
    JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../fixtures/commerce-rest/websites.json'), 'utf8')) as { body: unknown[] }
).body;

/** A store's three structure reads. */
const STORE_READS: Record<string, unknown> = {
    'store/websites': websites,
    'store/storeGroups': [{ id: 3, root_category_id: 51 }],
    'store/storeViews': [{ id: 4, code: 'bodea_us', website_id: 3, store_group_id: 3 }],
};

const get = async (requested: string) => STORE_READS[requested];

describe('resolveEngineTarget', () => {
    it('finds the website, the store view and the root category its store shows', async () => {
        await expect(resolveEngineTarget(get, { websiteCode: 'bodea', storeCode: 'bodea_us' })).resolves.toEqual({
            websiteCode: 'bodea',
            storeCode: 'bodea_us',
            websiteId: 3,
            storeId: 4,
            rootCategoryId: 51,
        });
    });

    it.each([
        ['an unknown website', { websiteCode: 'acme', storeCode: 'bodea_us' }],
        ['a store view on another website', { websiteCode: 'base', storeCode: 'bodea_us' }],
    ])('refuses %s, naming both codes', async (_label, codes) => {
        const answer = resolveEngineTarget(get, codes);

        await expect(answer).rejects.toThrow(InstallTargetError);
        await expect(resolveEngineTarget(get, codes)).rejects.toThrow(
            `The store has no store view ${codes.storeCode} on a website ${codes.websiteCode}.`,
        );
    });
});

describe('sessionFor', () => {
    it('points a fresh session at the target', async () => {
        const session = sessionFor(await resolveEngineTarget(get, { websiteCode: 'bodea', storeCode: 'bodea_us' }));

        expect(session).toMatchObject({ storeId: 4, websiteId: 3, websiteCode: 'bodea', rootCategory: { id: 51 } });
        expect(session.setIds.size).toBe(0);
    });
});
