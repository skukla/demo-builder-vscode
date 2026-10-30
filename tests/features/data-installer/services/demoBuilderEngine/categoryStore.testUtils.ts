/**
 * A fake store that keeps the category tree and the store structure written to it (datapack-engine
 * step 12), so a pack's root can be installed, the SC's Admin step done (the test changes a store's
 * `root_category_id`, as the Admin would) and the pack removed back to zero.
 *
 * The structure is the wipe's sandbox (`commerceWipeFixtures.ts`): `justrite_test_store` shows
 * JustRite's root 119, `bodea_store` has root 150 of its own. Category answers are shaped as
 * `GET categories/{id}` and `categories/list` answer (`StoreCategory`: id, name, parent_id, path,
 * children); the store lists as `GET store/websites`, `storeGroups`, `storeViews` answer.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { type RecordFiles, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { sessionFor } from '@/features/data-installer/services/demoBuilderEngine/installTarget';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { type StoreCategory, urlKeyOf } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceStoreGroup } from '@/types/commerceStore';
import { ADMIN_GROUP, SANDBOX_GROUPS, SANDBOX_VIEWS, SANDBOX_WEBSITES } from '../../../../helpers/commerceWipeFixtures';
import { NOW, PACK, PROJECT, type SentCall } from './demoBuilderEngine.testUtils';

/** Frescopa's shape: a root of its own, a top category under it, and one under that. */
export const FRESCOPA = {
    root_category: { name: 'Frescopa', is_active: true, include_in_menu: false },
    categories: [
        { category: { name: 'Coffee', path: 'Frescopa', is_active: true, include_in_menu: true } },
        { category: { name: 'Espresso', path: 'Frescopa/Coffee', is_active: true, include_in_menu: true } },
    ],
};

/** The two install targets: one whose store shares its root, one whose store has its own. */
export const SHARED_TARGET = { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' };
export const OWN_TARGET = { websiteCode: 'bodea', storeCode: 'bodea_en' };

type Row = Record<string, unknown>;

export interface CategoryStore {
    categories: Map<number, StoreCategory>;
    groups: CommerceStoreGroup[];
    sent: SentCall[];
    /** Point a store at a root, as the SC does in Stores > All Stores. */
    setRoot: (storeCode: string, rootId: number) => void;
    ctx: (files: RecordFiles, target: { websiteCode: string; storeCode: string }) => Promise<KindContext & { logged: string[] }>;
}

/** The value of one filter of a Commerce search, by its field. */
function filterValue(path: string, field: string): string | undefined {
    const at = path.indexOf(`[field]=${field}&`);
    if (at === -1) return undefined;
    const match = /\[value\]=([^&]*)/u.exec(path.slice(at));
    return match ? decodeURIComponent(match[1]) : undefined;
}

export function categoryStore(): CategoryStore {
    const categories = new Map<number, StoreCategory>([
        [1, { id: 1, name: 'Root Catalog', path: '1', children: '2,119,150' }],
        [2, { id: 2, name: 'Default Category', parent_id: 1, path: '1/2', children: '' }],
        [119, { id: 119, name: 'Justrite', parent_id: 1, path: '1/119', children: '' }],
        [150, { id: 150, name: 'Bodea Root', parent_id: 1, path: '1/150', children: '' }],
    ]);
    const groups = [ADMIN_GROUP, ...SANDBOX_GROUPS].map((g) => ({ ...g }));
    const sent: SentCall[] = [];
    let next = 300;
    const childrenOf = (id: number) => [...categories.values()].filter((c) => Number(c.parent_id) === id);
    const refresh = (id: number) => {
        const parent = categories.get(id);
        if (parent) categories.set(id, { ...parent, children: childrenOf(id).map((c) => c.id).join(',') });
    };
    const remove = (id: number) => {
        childrenOf(id).forEach((c) => remove(Number(c.id)));
        const gone = categories.get(id);
        categories.delete(id);
        if (gone) refresh(Number(gone.parent_id));
    };
    const get = async (path: string): Promise<unknown> => {
        if (path === 'store/websites') return [{ id: 0, code: 'admin', name: 'Admin' }, ...SANDBOX_WEBSITES];
        if (path === 'store/storeGroups') return groups;
        if (path === 'store/storeViews') return SANDBOX_VIEWS;
        if (path.startsWith('categories/list?')) {
            const parent = Number(filterValue(path, 'parent_id'));
            const name = filterValue(path, 'name');
            const urlKey = filterValue(path, 'url_key');
            const items = childrenOf(parent).filter((c) => (name !== undefined ? c.name === name : urlKeyOf(c) === urlKey));
            return { items, total_count: items.length };
        }
        if (path.startsWith('products?')) return { items: [], total_count: 0 };
        const id = /^categories\/(\d+)$/u.exec(path)?.[1];
        const category = id ? categories.get(Number(id)) : undefined;
        if (category) return category;
        throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
    };
    const send = async (method: string, path: string, body: unknown): Promise<unknown> => {
        sent.push({ method, path, body });
        if (method === 'POST' && path === 'categories') {
            const row = (body as { category: Row }).category;
            const parent = categories.get(Number(row.parent_id));
            const id = next++;
            categories.set(id, { ...row, id, name: String(row.name), parent_id: Number(row.parent_id), path: `${parent?.path}/${id}`, children: '' } as StoreCategory);
            refresh(Number(row.parent_id));
            return { id };
        }
        const deleted = /^categories\/(\d+)$/u.exec(path)?.[1];
        if (method === 'DELETE' && deleted) remove(Number(deleted));
        return true;
    };
    return {
        categories,
        groups,
        sent,
        setRoot: (storeCode, rootId) => {
            const group = groups.find((g) => g.code === storeCode);
            if (group) group.root_category_id = rootId;
        },
        ctx: async (files, target) => {
            const view = SANDBOX_VIEWS.find((v) => v.code === target.storeCode)!;
            const group = groups.find((g) => g.id === view.store_group_id)!;
            const session = sessionFor({ ...target, websiteId: view.website_id, storeId: view.id, rootCategoryId: Number(group.root_category_id) });
            const logged: string[] = [];
            const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, target);
            return { get, send, recorder, session, logged, log: (line: string) => void logged.push(line) };
        },
    };
}

/** Category ids by name, as the store holds them now. */
export function idsByName(store: CategoryStore): Record<string, number> {
    return Object.fromEntries([...store.categories.values()].map((c) => [c.name, Number(c.id)]));
}
