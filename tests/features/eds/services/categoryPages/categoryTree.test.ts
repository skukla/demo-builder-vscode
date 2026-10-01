/**
 * readCategoryTree — the store view's category tree, walked from its root.
 *
 * WHERE THE SHAPES COME FROM. The category rows are Adobe's documented example
 * response for Catalog Service `categories` (developer.adobe.com/commerce/services/
 * graphql/catalog-service/categories/, read 2026-10-01): `children` is a list of id
 * STRINGS, `urlPath` has no leading slash, `roles` carries `show_in_menu` and
 * `active`. The `storeConfig.root_category_uid` shape is Commerce Core's — a
 * base64 of the numeric id. No live capture exists yet: the live run that would
 * capture one is a cloud read the parent session owns.
 */

import {
    readCategoryTree,
    type CategoryQueryRunner,
} from '@/features/eds/services/categoryPages/categoryTree';

/** Adobe's documented rows, keyed by id, plus a root and a top level to hang them on. */
const ROWS: Record<string, Record<string, unknown>> = {
    '2': { id: '2', name: 'Default Category', level: 1, roles: ['active'], path: '1/2', urlPath: '', urlKey: '', parentId: '1', children: ['11'] },
    '11': { id: '11', name: 'Men', level: 2, roles: ['active', 'show_in_menu'], path: '1/2/11', urlPath: 'men', urlKey: 'men', parentId: '2', children: ['12', '13'] },
    '13': { name: 'Bottoms', position: 2, id: '13', level: 3, roles: ['active', 'show_in_menu'], path: '1/2/11/13', urlPath: 'men/bottoms-men', urlKey: 'bottoms-men', parentId: '11', children: ['18', '19'] },
    '12': { name: 'Tops', position: 1, id: '12', level: 3, roles: ['active', 'show_in_menu'], path: '1/2/11/12', urlPath: 'men/tops-men', urlKey: 'tops-men', parentId: '11', children: ['14'] },
    '14': { name: 'Jackets', position: 1, id: '14', level: 4, roles: ['active', 'show_in_menu'], path: '1/2/11/12/14', urlPath: 'men/tops-men/jackets-men', urlKey: 'jackets-men', parentId: '12', children: [] },
    '18': { name: 'Pants', position: 1, id: '18', level: 4, roles: ['active', 'show_in_menu'], path: '1/2/11/13/18', urlPath: 'men/bottoms-men/pants-men', urlKey: 'pants-men', parentId: '13', children: [] },
    '19': { name: 'Shorts', position: 2, id: '19', level: 4, roles: ['active', 'show_in_menu'], path: '1/2/11/13/19', urlPath: 'men/bottoms-men/shorts-men', urlKey: 'shorts-men', parentId: '13', children: [] },
};

/** A runner answering storeConfig on Core and `categories(ids:)` on Catalog Service. */
function runnerOver(rows: Record<string, Record<string, unknown>>, rootUid = 'Mg==') {
    const calls: Array<{ endpoint: string; variables: Record<string, unknown> }> = [];
    const run: CategoryQueryRunner = async (query, variables, endpoint) => {
        calls.push({ endpoint, variables });
        if (query.includes('storeConfig')) return { storeConfig: { root_category_uid: rootUid } };
        const ids = (variables.ids as string[]) ?? [];
        return { categories: ids.filter((id) => rows[id]).map((id) => rows[id]) };
    };
    return { run, calls };
}

describe('readCategoryTree', () => {
    it('finds the root from storeConfig and walks every level through Catalog Service', async () => {
        const { run, calls } = runnerOver(ROWS);
        const tree = await readCategoryTree(run);

        expect(tree.rootId).toBe('2');
        expect(tree.categories.map((c) => c.id).sort()).toEqual(['11', '12', '13', '14', '18', '19', '2']);
        // The root's store scope is a Core answer; the tree is Catalog Service's.
        expect(calls[0].endpoint).toBe('commerceGraphQl');
        expect(calls.slice(1).every((c) => c.endpoint === 'catalogService')).toBe(true);
        // One request per level, not one per category.
        expect(calls.slice(1).map((c) => c.variables.ids)).toEqual([['2'], ['11'], ['12', '13'], ['14', '18', '19']]);
    });

    it('keeps the fields a page needs, as the backend spells them', async () => {
        const { run } = runnerOver(ROWS);
        const tree = await readCategoryTree(run);
        expect(tree.categories.find((c) => c.id === '14')).toEqual({
            id: '14',
            name: 'Jackets',
            urlPath: 'men/tops-men/jackets-men',
            level: 4,
            parentId: '12',
            roles: ['active', 'show_in_menu'],
            children: [],
        });
    });

    it('drops a leading slash from urlPath — the SaaS schema reference shows one, the example response does not', async () => {
        // graphql-api-saas-types-c-e.md (CategoryView.urlPath): "/electronics/laptops".
        // The product-list-page block filters categoryPath on the bare form ("apparel").
        const slashed = { ...ROWS, '14': { ...ROWS['14'], urlPath: '/men/tops-men/jackets-men/' } };
        const { run } = runnerOver(slashed);
        const tree = await readCategoryTree(run);
        expect(tree.categories.find((c) => c.id === '14')?.urlPath).toBe('men/tops-men/jackets-men');
    });

    it('starts from a root the caller names, without asking storeConfig', async () => {
        const { run, calls } = runnerOver(ROWS);
        const tree = await readCategoryTree(run, { rootCategoryId: '11' });
        expect(tree.rootId).toBe('11');
        expect(calls.some((c) => c.endpoint === 'commerceGraphQl')).toBe(false);
        expect(tree.categories.map((c) => c.id)).not.toContain('2');
    });

    it('refuses a root id that is not a number rather than sending it', async () => {
        const { run } = runnerOver(ROWS);
        await expect(readCategoryTree(run, { rootCategoryId: '2") { x } #' })).rejects.toThrow(/numeric/);
    });

    it('says plainly when storeConfig answers no root', async () => {
        const { run } = runnerOver(ROWS, '');
        await expect(readCategoryTree(run)).rejects.toThrow(/root category/);
    });

    it('fails when the root itself is not in Catalog Service, rather than reporting an empty tree', async () => {
        const { run } = runnerOver(ROWS, Buffer.from('999').toString('base64'));
        await expect(readCategoryTree(run)).rejects.toThrow(/999/);
    });

    it('survives a cycle in children (visits each id once)', async () => {
        const looped = { ...ROWS, '14': { ...ROWS['14'], children: ['11'] } };
        const { run } = runnerOver(looped);
        const tree = await readCategoryTree(run);
        expect(tree.categories.filter((c) => c.id === '11')).toHaveLength(1);
    });

    it('stops at the category ceiling and says so', async () => {
        const { run } = runnerOver(ROWS);
        const tree = await readCategoryTree(run, { maxCategories: 3 });
        expect(tree.categories).toHaveLength(3);
        expect(tree.truncated).toBe(true);
    });
});
