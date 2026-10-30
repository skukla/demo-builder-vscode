/**
 * The `categories` kind: a pack's category tree, found or made under its root, and taken back
 * exactly as far as this engine made it (DI-5; catalog spec §4).
 *
 * A pack holds `{ root_category?, categories: [{ category }] }`. Each category's `path` is the
 * chain of its PARENTS' names, starting with the root's (Bodea: `"Bodea/Products"`), never its
 * own. Ids in the rows come from the store the pack was exported from and are never sent.
 *
 * Where this deliberately differs from the service: it looks a category up by parent AND name,
 * one filter group each, which Commerce joins with AND; the service put both in one group,
 * which Commerce joins with OR, so a real match could be missed and a duplicate made. A
 * category whose parent cannot be found stops the install, where the service quietly hung it
 * from the store's root. Removal deletes only what this engine made, by its own ids.
 *
 * Endpoints (spec §4): `GET categories/list`, `POST categories`, `DELETE categories/{id}`.
 *
 * A new root category shows on a storefront only once the store uses it as its root, and no API
 * can set that. So when the store's root is its own, the install leaves the pack's root out and
 * its categories go under the store's (`packRoot.ts`); when it is shared, the root is made and the
 * SC is asked for the one Admin step (`packRootStep.ts`, step 12).
 *
 * @module features/data-installer/services/demoBuilderEngine/categoriesKind
 */

import { z } from 'zod';
import { deleteIfPresent, type KindContext, ownedId, segment } from './kindContext';
import { keyOf } from './packForm';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

export const CATEGORY_KIND = 'categories';

/** The top of Commerce's category tree, which every root category hangs from. */
const TREE_ROOT_ID = 1;

const fields = {
    name: z.string().min(1),
    is_active: z.boolean().optional(),
    include_in_menu: z.boolean().optional(),
    position: z.number().optional(),
    custom_attributes: z.array(z.object({ attribute_code: z.string(), value: z.unknown() })).optional(),
};

const packSchema = z.object({
    root_category: z.object(fields).passthrough().optional(),
    categories: z.array(z.object({ category: z.object({ ...fields, path: z.string() }).passthrough() })),
});

export type CategoryPack = z.infer<typeof packSchema>;
type CategoryFields = z.infer<z.ZodObject<typeof fields>>;

export interface FoundCategory {
    id: number;
    name?: string;
    parent_id?: number;
}

/** The pack's categories, or why they cannot be installed. */
export function parseCategoryPack(records: unknown): CategoryPack {
    const parsed = packSchema.safeParse(records);
    if (!parsed.success) {
        throw new Error(`The pack's categories are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
}

/** The fields Commerce is sent: never the source store's ids, path or parent. */
function body(category: CategoryFields & Record<string, unknown>, parentId: number): unknown {
    const { id: _id, parent_id: _parent, path: _path, ...rest } = category;
    return { category: { ...rest, parent_id: parentId } };
}

/** The categories directly under `parentId` whose `field` is `value`: `GET categories/list`, two filter groups. */
export async function childrenWhere(get: CommerceGet, parentId: number, field: string, value: string): Promise<FoundCategory[]> {
    const criteria =
        'searchCriteria[filterGroups][0][filters][0][field]=parent_id' +
        `&searchCriteria[filterGroups][0][filters][0][value]=${parentId}` +
        `&searchCriteria[filterGroups][1][filters][0][field]=${field}` +
        `&searchCriteria[filterGroups][1][filters][0][value]=${encodeURIComponent(value)}`;
    const answer = (await get(`categories/list?${criteria}`)) as { items?: FoundCategory[] } | null;
    return (answer?.items ?? []).filter((c) => Number(c.parent_id) === parentId);
}

/** The category named `name` directly under `parentId`, if the store has one. */
export async function findChild(get: CommerceGet, parentId: number, name: string): Promise<number | undefined> {
    return (await childrenWhere(get, parentId, 'name', name)).find((c) => c.name === name)?.id;
}

/**
 * Find the category under its parent, or make it and record it. One this engine made before is
 * known by its id, renamed in the Admin or not; one the SC deleted since answers undefined, and
 * is left deleted (step 05).
 */
async function findOrCreate(
    ctx: KindContext,
    category: CategoryFields & Record<string, unknown>,
    parentId: number,
    path: string,
): Promise<number | undefined> {
    const owned = ownedId(ctx.session, CATEGORY_KIND, keyOf(CATEGORY_KIND, { category: { ...category, path } }) ?? '');
    if (owned === null) return undefined;
    if (owned !== undefined) return Number(owned);
    const existing = await findChild(ctx.get, parentId, category.name);
    if (existing !== undefined) return Number(existing);
    const created = (await ctx.send('POST', 'categories', body(category, parentId))) as FoundCategory | null;
    if (created?.id === undefined) throw new Error(`Commerce made no category ${category.name}.`);
    await ctx.recorder.record({ kind: CATEGORY_KIND, id: String(created.id) });
    ctx.log(`created category ${category.name}`);
    return Number(created.id);
}

/** How deep a path is: `"Bodea/Products"` is 2. */
function depth(path: string): number {
    return path.split('/').length;
}

/** Install the tree, shallowest first, so every parent exists before its children. */
export async function installCategories(ctx: KindContext, pack: CategoryPack): Promise<void> {
    if (pack.root_category) {
        const id = await findOrCreate(ctx, pack.root_category, TREE_ROOT_ID, '');
        if (id === undefined) {
            ctx.log(`left the pack's categories out: the SC deleted its root, ${pack.root_category.name}`);
            return;
        }
        ctx.session.rootCategory = { id, name: pack.root_category.name };
        ctx.session.packRoot = { id, name: pack.root_category.name };
    }
    const rows = [...pack.categories].sort((a, b) => depth(a.category.path) - depth(b.category.path));
    // A pack with no root of its own names the root of the store it came from first in every
    // path ("Default Category/…"); here that means this store's root, whatever it is called.
    const rootLabel = pack.root_category?.name ?? rows[0]?.category.path.split('/')[0] ?? '';
    const byPath = new Map<string, number>([[rootLabel, ctx.session.rootCategory.id]]);
    // Under a category the SC deleted: left out with it.
    const deleted = new Set<string>();
    for (const { category } of rows) {
        const own = `${category.path}/${category.name}`;
        if (deleted.has(category.path)) {
            deleted.add(own);
            continue;
        }
        const parentId = byPath.get(category.path);
        if (parentId === undefined) {
            throw new Error(`The category ${category.name} sits under "${category.path}", which the pack does not make.`);
        }
        const id = await findOrCreate(ctx, category, parentId, category.path);
        if (id === undefined) deleted.add(own);
        else byPath.set(own, id);
    }
}

/** Take back one category this engine made; Commerce takes its children with it. */
export function removeCategory(send: CommerceSend, id: string): Promise<void> {
    return deleteIfPresent(send, `categories/${segment(id)}`);
}
