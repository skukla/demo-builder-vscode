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
 * Open (not decided here): a new root category shows on a storefront only once the store uses
 * it as its root. The service does not set that, and neither does this.
 *
 * @module features/data-installer/services/demoBuilderEngine/categoriesKind
 */

import { z } from 'zod';
import { deleteIfPresent, type KindContext } from './kindContext';
import type { CommerceSend } from '@/types/commerceWire';

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

interface FoundCategory {
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

/** The category named `name` directly under `parentId`, if the store has one. */
async function findChild(ctx: KindContext, parentId: number, name: string): Promise<number | undefined> {
    const criteria =
        'searchCriteria[filterGroups][0][filters][0][field]=parent_id' +
        `&searchCriteria[filterGroups][0][filters][0][value]=${parentId}` +
        '&searchCriteria[filterGroups][1][filters][0][field]=name' +
        `&searchCriteria[filterGroups][1][filters][0][value]=${encodeURIComponent(name)}`;
    const answer = (await ctx.get(`categories/list?${criteria}`)) as { items?: FoundCategory[] } | null;
    return answer?.items?.find((c) => c.name === name && Number(c.parent_id) === parentId)?.id;
}

/** Find the category under its parent, or make it and record it. */
async function findOrCreate(
    ctx: KindContext,
    category: CategoryFields & Record<string, unknown>,
    parentId: number,
): Promise<number> {
    const existing = await findChild(ctx, parentId, category.name);
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
        const id = await findOrCreate(ctx, pack.root_category, TREE_ROOT_ID);
        ctx.session.rootCategory = { id, name: pack.root_category.name };
    }
    const root = ctx.session.rootCategory;
    const byPath = new Map<string, number>([[root.name, root.id]]);
    const rows = [...pack.categories].sort((a, b) => depth(a.category.path) - depth(b.category.path));
    for (const { category } of rows) {
        const parentId = byPath.get(category.path);
        if (parentId === undefined) {
            throw new Error(`The category ${category.name} sits under "${category.path}", which the pack does not make.`);
        }
        byPath.set(`${category.path}/${category.name}`, await findOrCreate(ctx, category, parentId));
    }
}

/** Take back one category this engine made; Commerce takes its children with it. */
export function removeCategory(send: CommerceSend, id: string): Promise<void> {
    return deleteIfPresent(send, `categories/${id}`);
}
