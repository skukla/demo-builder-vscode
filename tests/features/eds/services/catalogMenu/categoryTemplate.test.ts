/**
 * The starter category template, `/categories/default` (EDS-61, owner decision D2).
 *
 * The overlay fills this one authored page for every category: the first `<h1>` becomes
 * the category name and the `product-list-page` block's `urlPath` row its url path
 * (`accs-discovery-service/actions/lib/category-page.js`, `fillCategoryTemplate`). Setup
 * writes a starter when the site has none, so the SC has a page to edit — and never
 * overwrites one: ADR-013's rule, by the hash recorded after the write.
 */

import {
    ensureCategoryTemplate,
    removeCategoryTemplate,
    STARTER_CATEGORY_TEMPLATE,
} from '@/features/eds/services/catalogMenu/categoryTemplate';
import { hashOf } from '@/features/eds/services/catalogMenu/ownedPages';
import { fakeStorefront } from './catalogMenuService.testUtils';

const TEMPLATE = '/categories/default';

describe('STARTER_CATEGORY_TEMPLATE', () => {
    it('holds what the overlay fills: a heading, and a product-list-page block with a urlPath row', () => {
        expect(STARTER_CATEGORY_TEMPLATE).toBe(
            '<body><header></header><main><div>' +
                '<h1>Category name</h1>' +
                '<div class="product-list-page"><div><div>urlPath</div><div>default</div></div></div>' +
                '</div></main><footer></footer></body>',
        );
    });
});

describe('ensureCategoryTemplate', () => {
    it('writes and publishes the starter when the site has none, and records what DA.live stored', async () => {
        const site = fakeStorefront({});

        const outcome = await ensureCategoryTemplate(site.port, undefined);

        expect(site.written).toEqual([TEMPLATE]);
        expect(outcome).toEqual({ status: 'written', hash: hashOf(STARTER_CATEGORY_TEMPLATE) });
    });

    it('never overwrites a template Demo Builder did not write', async () => {
        const site = fakeStorefront({ [TEMPLATE]: '<body>the SC made this</body>' });

        const outcome = await ensureCategoryTemplate(site.port, undefined);

        expect(site.written).toStrictEqual([]);
        expect(outcome).toEqual({ status: 'not-ours' });
    });

    it('leaves its own unchanged starter in place and keeps claiming it', async () => {
        const site = fakeStorefront({ [TEMPLATE]: STARTER_CATEGORY_TEMPLATE });

        const outcome = await ensureCategoryTemplate(site.port, hashOf(STARTER_CATEGORY_TEMPLATE));

        expect(site.written).toStrictEqual([]);
        expect(outcome).toEqual({ status: 'kept', hash: hashOf(STARTER_CATEGORY_TEMPLATE) });
    });

    it('treats an edited starter as the SC\'s from then on', async () => {
        const site = fakeStorefront({ [TEMPLATE]: '<body>edited</body>' });

        const outcome = await ensureCategoryTemplate(site.port, hashOf(STARTER_CATEGORY_TEMPLATE));

        expect(site.written).toStrictEqual([]);
        expect(outcome).toEqual({ status: 'edited' });
    });

    it('reports a failed write without throwing', async () => {
        const site = fakeStorefront({}, [TEMPLATE]);

        const outcome = await ensureCategoryTemplate(site.port, undefined);

        expect(outcome).toEqual({ status: 'failed', error: `HTTP 500 writing ${TEMPLATE}` });
    });
});

describe('removeCategoryTemplate (the undo)', () => {
    it('removes its own unchanged starter', async () => {
        const site = fakeStorefront({ [TEMPLATE]: STARTER_CATEGORY_TEMPLATE });

        expect(await removeCategoryTemplate(site.port, hashOf(STARTER_CATEGORY_TEMPLATE))).toBe('removed');
        expect(site.removed).toEqual([TEMPLATE]);
    });

    it('keeps an edited one, and touches nothing without a record', async () => {
        const site = fakeStorefront({ [TEMPLATE]: '<body>edited</body>' });

        expect(await removeCategoryTemplate(site.port, hashOf(STARTER_CATEGORY_TEMPLATE))).toBe('edited');
        expect(await removeCategoryTemplate(site.port, undefined)).toBe('not-recorded');
        expect(site.removed).toStrictEqual([]);
    });
});
