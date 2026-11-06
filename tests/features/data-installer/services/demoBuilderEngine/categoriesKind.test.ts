/**
 * The categories kind: find or make the pack's tree under its root, parents first, record what
 * was made, and take back only that (DI-5).
 *
 * The rows are Bodea `main`'s own, trimmed, as the Data Installer service answered them on
 * 2026-10-27 (`batch-get-data-items`, read-only): a root under the tree's top, and each
 * category's `path` naming its parents.
 */

import {
    CATEGORY_KIND,
    installCategories,
    parseCategoryPack,
    removeCategory,
} from '@/features/data-installer/services/demoBuilderEngine/categoriesKind';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

const BODEA = {
    root_category: { name: 'Bodea', parent_id: 1, is_active: true, include_in_menu: false },
    categories: [
        {
            category: {
                name: 'Critical Power',
                parent_id: 4,
                path: 'Bodea/Products',
                is_active: true,
                position: 1,
                include_in_menu: true,
                custom_attributes: [{ attribute_code: 'url_key', value: 'critical-power' }],
            },
        },
        {
            category: {
                name: 'Products',
                parent_id: 3,
                path: 'Bodea',
                is_active: true,
                position: 1,
                include_in_menu: true,
                custom_attributes: [{ attribute_code: 'url_key', value: 'products' }],
            },
        },
    ],
};

/** The search for `name` directly under `parentId`, as the kind sends it. */
function childSearch(parentId: number, name: string): string {
    return (
        'categories/list?searchCriteria[filterGroups][0][filters][0][field]=parent_id' +
        `&searchCriteria[filterGroups][0][filters][0][value]=${parentId}` +
        '&searchCriteria[filterGroups][1][filters][0][field]=name' +
        `&searchCriteria[filterGroups][1][filters][0][value]=${encodeURIComponent(name)}`
    );
}

const NONE = { items: [], total_count: 0 };

/** Commerce's answer to each create: the next id from 40. */
function numbered(): (call: SentCall) => unknown {
    let next = 40;
    return () => ({ id: next++ });
}

describe('installCategories', () => {
    it('makes the root under the tree top, then parents before children, and records each', async () => {
        const ctx = await fakeContext(
            {
                [childSearch(1, 'Bodea')]: NONE,
                [childSearch(40, 'Products')]: NONE,
                [childSearch(41, 'Critical Power')]: NONE,
            },
            numbered(),
        );

        await installCategories(ctx, parseCategoryPack(BODEA));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'categories',
                body: { category: { name: 'Bodea', is_active: true, include_in_menu: false, parent_id: 1 } },
            },
            {
                method: 'POST',
                path: 'categories',
                body: {
                    category: {
                        name: 'Products',
                        is_active: true,
                        position: 1,
                        include_in_menu: true,
                        custom_attributes: [{ attribute_code: 'url_key', value: 'products' }],
                        parent_id: 40,
                    },
                },
            },
            {
                method: 'POST',
                path: 'categories',
                body: {
                    category: {
                        name: 'Critical Power',
                        is_active: true,
                        position: 1,
                        include_in_menu: true,
                        custom_attributes: [{ attribute_code: 'url_key', value: 'critical-power' }],
                        parent_id: 41,
                    },
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([
            { kind: CATEGORY_KIND, id: '40', key: '(root)' },
            { kind: CATEGORY_KIND, id: '41', key: 'Products' },
            { kind: CATEGORY_KIND, id: '42', key: 'Products/Critical Power' },
        ]);
        expect(ctx.session.rootCategory).toEqual({ id: 40, name: 'Bodea' });
    });

    it("sends a level's categories together, and a child only once its whole level is made", async () => {
        const row = (name: string, path: string) => ({ category: { name, path } });
        const pack = { root_category: { name: 'Bodea' }, categories: [row('Tools', 'Bodea/Gear'), row('Gear', 'Bodea'), row('Parts', 'Bodea'), row('Gear', 'Bodea')] };
        const ctx = await fakeContext(
            {
                [childSearch(1, 'Bodea')]: NONE,
                [childSearch(40, 'Gear')]: NONE,
                [childSearch(40, 'Parts')]: NONE,
                [childSearch(41, 'Tools')]: NONE,
            },
            numbered(),
        );
        const send = ctx.send;
        const events: string[] = [];
        ctx.send = async (method, path, body, route) => {
            const name = (body as { category: { name: string } }).category.name;
            events.push(`send ${name}`);
            // Answered only once everything else waiting has run, as a real round trip is.
            await new Promise((resolve) => setImmediate(resolve));
            const answer = await send(method, path, body, route);
            events.push(`made ${name}`);
            return answer;
        };

        await installCategories(ctx, parseCategoryPack(pack));

        // The second "Gear" row is the first one again: made once, as when one row found the other.
        expect(events).toEqual(['send Bodea', 'made Bodea', 'send Gear', 'send Parts', 'made Gear', 'made Parts', 'send Tools', 'made Tools']);
        expect(ctx.recorder.created.map((o) => o.key)).toEqual(['(root)', 'Gear', 'Parts', 'Gear/Tools']);
    });

    it('uses categories the store already has under the same parent, and records nothing for them', async () => {
        const ctx = await fakeContext(
            {
                [childSearch(1, 'Bodea')]: { items: [{ id: 12, name: 'Bodea', parent_id: 1 }] },
                [childSearch(12, 'Products')]: { items: [{ id: 13, name: 'Products', parent_id: 12 }] },
                [childSearch(13, 'Critical Power')]: NONE,
            },
            numbered(),
        );

        await installCategories(ctx, parseCategoryPack(BODEA));

        expect(ctx.sent.map((c) => (c.body as { category: { parent_id: number } }).category.parent_id)).toEqual([13]);
        expect(ctx.recorder.created).toEqual([{ kind: CATEGORY_KIND, id: '40', key: 'Products/Critical Power' }]);
    });

    it('does not take a same-named category under another parent for this one', async () => {
        const ctx = await fakeContext(
            {
                [childSearch(1, 'Bodea')]: { items: [{ id: 99, name: 'Bodea', parent_id: 7 }] },
                [childSearch(40, 'Products')]: NONE,
                [childSearch(41, 'Critical Power')]: NONE,
            },
            numbered(),
        );

        await installCategories(ctx, parseCategoryPack(BODEA));

        expect(ctx.recorder.created).toHaveLength(3);
    });

    it('hangs a pack with no root from the store\'s root category', async () => {
        const ctx = await fakeContext({ [childSearch(2, 'Sale')]: NONE }, numbered());
        const pack = { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] };

        await installCategories(ctx, parseCategoryPack(pack));

        expect(ctx.sent[0].body).toEqual({ category: { name: 'Sale', parent_id: 2 } });
    });

    it('reads the first part of a rootless pack\'s paths as this store\'s root, whatever it is called', async () => {
        const ctx = await fakeContext({ [childSearch(7, 'Sale')]: NONE }, numbered());
        ctx.session.rootCategory = { id: 7, name: '' };
        const pack = { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] };

        await installCategories(ctx, parseCategoryPack(pack));

        expect(ctx.sent[0].body).toEqual({ category: { name: 'Sale', parent_id: 7 } });
    });

    it('stops at a category whose parent the pack does not make', async () => {
        const ctx = await fakeContext({}, numbered());
        const pack = { categories: [{ category: { name: 'Orphan', path: 'Default Category/Gone' } }] };

        await expect(installCategories(ctx, parseCategoryPack(pack))).rejects.toThrow(
            'The category Orphan sits under "Default Category/Gone", which the pack does not make.',
        );
        expect(ctx.sent).toStrictEqual([]);
    });

    it('fails when Commerce answers no id for a category it was sent', async () => {
        const ctx = await fakeContext({ [childSearch(1, 'Bodea')]: NONE }, () => ({}));

        await expect(installCategories(ctx, parseCategoryPack(BODEA))).rejects.toThrow('Commerce made no category Bodea.');
    });
});

describe('parseCategoryPack', () => {
    it('refuses a category with no path', () => {
        expect(() => parseCategoryPack({ categories: [{ category: { name: 'x' } }] })).toThrow(/categories/);
    });
});

describe('removeCategory', () => {
    it('deletes a category it made, by its own id', async () => {
        const ctx = await fakeContext();

        await removeCategory(ctx.send, '41');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'categories/41', body: undefined }]);
    });
});
