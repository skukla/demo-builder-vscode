/**
 * The `attribute_sets` and `attribute_assign_to_set` kinds (DI-5).
 *
 * Sets: one the store has by name is used and left alone; one it lacks is created from the
 * default skeleton, with a group named like the set for the pack's attributes to go in, as the
 * service does (catalog spec §2). Assignments: an attribute already in its set is left; one
 * that is not is added, and recorded, so removal takes it back out even of a set the store
 * already had. The service removes no assignment at all (spec §3), which strands an attribute
 * it did not create inside a set it did not create.
 *
 * Endpoints (spec §2-3; the ERP work's `erpOwnerAttributeSets.ts`):
 * `GET products/attribute-sets/sets/list`, `POST products/attribute-sets`,
 * `POST products/attribute-sets/groups`, `GET products/attribute-sets/groups/list`,
 * `GET products/attribute-sets/{id}/attributes`, `POST products/attribute-sets/attributes`,
 * `DELETE products/attribute-sets/{id}`, `DELETE products/attribute-sets/{id}/attributes/{code}`.
 *
 * @module features/data-installer/services/demoBuilderEngine/attributeSetsKind
 */

import { z } from 'zod';
import { ATTRIBUTE_CODE, deleteIfPresent, type KindContext, MissingNameError, ownedId, segment } from './kindContext';
import { createOne } from './pendingCreates';
import { needsUnskipped, tryRow } from './refusedRows';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { pickAttributeGroup, readSetGroups } from '@/features/app-builder/services/erpOwnerAttributeSets';
import type { CommerceAttributeSetList, CommerceSend, CommerceSetAttribute } from '@/types/commerceWire';

export const ATTRIBUTE_SET_KIND = 'attribute_sets';
export const ASSIGNMENT_KIND = 'attribute_assign_to_set';
/** `attributesKind`'s kind, named here so an assignment can say it needs a skipped attribute. */
const ATTRIBUTE_KIND_NAME = 'product_attributes';

/** Magento's product entity type, and the Default set every new set is copied from. */
const PRODUCT_ENTITY_TYPE = 4;
const DEFAULT_SKELETON = 4;
/** Where the service puts the set's own group (spec §2 step 5). */
const OWN_GROUP_SORT_ORDER = '100';

const setRowSchema = z.object({
    attributeSet: z.object({
        attribute_set_name: z.string().min(1),
        sort_order: z.number().optional(),
        entity_type_id: z.number().optional(),
    }),
    skeletonId: z.number().optional(),
});

/** `attributeSetId` holds the set's NAME, not an id (spec §3). */
const assignmentRowSchema = z.object({
    attributeSetId: z.string().min(1),
    attributeCode: z.string().regex(ATTRIBUTE_CODE, 'is not a Commerce attribute code'),
    sortOrder: z.number().optional(),
});

export type AttributeSetRow = z.infer<typeof setRowSchema>;
export type AssignmentRow = z.infer<typeof assignmentRowSchema>;

function parseRows<T>(schema: z.ZodType<T>, records: unknown, what: string): T[] {
    const parsed = z.array(schema).safeParse(records);
    if (!parsed.success) {
        throw new Error(`The pack's ${what} are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
}

export const parseAttributeSetRows = (records: unknown) => parseRows(setRowSchema, records, 'attribute sets');
export const parseAssignmentRows = (records: unknown) => parseRows(assignmentRowSchema, records, 'attribute assignments');

/** Lowercase, anything else an underscore: how the service names a set's own group. */
function groupCode(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/gu, '_');
}

/** Read every set the store has into the session, once per install. Products use it too. */
export async function loadStoreSets(ctx: KindContext): Promise<void> {
    if (ctx.session.setIds.size > 0) return;
    const sets = await readAllPages<NonNullable<CommerceAttributeSetList['items']>[number]>(
        ctx.get,
        'products/attribute-sets/sets/list',
    );
    for (const set of sets) ctx.session.setIds.set(set.attribute_set_name, set.attribute_set_id);
}

/** The group a set's pack attributes go in: one named like the set, else the house pick. */
async function groupInSet(ctx: KindContext, name: string, setId: number): Promise<number | undefined> {
    const known = ctx.session.groupIds.get(name);
    if (known !== undefined) return known;
    const groups = await readSetGroups(ctx.get, setId);
    const pick = groups.find((g) => g.attribute_group_name === name) ?? pickAttributeGroup(groups);
    if (pick) ctx.session.groupIds.set(name, Number(pick.attribute_group_id));
    return pick ? Number(pick.attribute_group_id) : undefined;
}

async function createOwnGroup(ctx: KindContext, name: string, setId: number): Promise<void> {
    const group = (await ctx.send('POST', 'products/attribute-sets/groups', {
        group: {
            attribute_group_name: name,
            attribute_set_id: setId,
            extension_attributes: { attribute_group_code: groupCode(name), sort_order: OWN_GROUP_SORT_ORDER },
        },
    })) as { attribute_group_id?: number | string } | null;
    if (group?.attribute_group_id === undefined) throw new Error(`Commerce made no group for the set ${name}.`);
    ctx.session.groupIds.set(name, Number(group.attribute_group_id));
}

/** Create the sets the store lacks, each with its own group, and record them. */
export async function installAttributeSets(ctx: KindContext, rows: readonly AttributeSetRow[]): Promise<void> {
    await loadStoreSets(ctx);
    for (const { attributeSet, skeletonId } of rows) {
        const name = attributeSet.attribute_set_name;
        // One this engine made is known by its id, renamed in the Admin or not; one the SC
        // deleted since stays deleted (step 05).
        const owned = ownedId(ctx.session, ATTRIBUTE_SET_KIND, name);
        if (owned === null) continue;
        if (owned !== undefined) ctx.session.setIds.set(name, Number(owned));
        const existing = ctx.session.setIds.get(name);
        if (existing !== undefined) {
            const ours = ctx.recorder.has(ATTRIBUTE_SET_KIND, String(existing));
            if ((await groupInSet(ctx, name, existing)) === undefined && ours) await createOwnGroup(ctx, name, existing);
            continue;
        }
        // Step 14 item 3: a set Commerce refuses is skipped, and the rows that need it with it.
        await tryRow(ctx, { kind: ATTRIBUTE_SET_KIND, key: name }, async () => {
            const made = await createOne(ctx, { kind: ATTRIBUTE_SET_KIND, key: name }, async () => {
                const created = (await ctx.send('POST', 'products/attribute-sets', {
                    attributeSet: { entity_type_id: PRODUCT_ENTITY_TYPE, sort_order: 0, ...attributeSet },
                    skeletonId: skeletonId ?? DEFAULT_SKELETON,
                })) as { attribute_set_id?: number } | null;
                if (created?.attribute_set_id === undefined) throw new Error(`Commerce made no attribute set ${name}.`);
                return { kind: ATTRIBUTE_SET_KIND, id: String(created.attribute_set_id) };
            });
            ctx.session.setIds.set(name, Number(made.id));
            ctx.log(`created attribute set ${name}`);
            await createOwnGroup(ctx, name, Number(made.id));
        });
    }
}

/** Put each attribute in its set unless it is there already, and record what was added. */
export async function installAssignments(ctx: KindContext, rows: readonly AssignmentRow[]): Promise<void> {
    await loadStoreSets(ctx);
    const inSet = new Map<number, Set<string>>();
    for (const row of rows) {
        const key = `${row.attributeSetId}/${row.attributeCode}`;
        if (ownedId(ctx.session, ASSIGNMENT_KIND, key) === null) continue;
        await tryRow(ctx, { kind: ASSIGNMENT_KIND, key }, () => assign(ctx, row, inSet));
    }
}

/** Put one attribute in its set unless it is there already, and record it. */
async function assign(ctx: KindContext, row: AssignmentRow, inSet: Map<number, Set<string>>): Promise<void> {
    needsUnskipped(ctx.session, ATTRIBUTE_KIND_NAME, row.attributeCode);
    const setId = ctx.session.setIds.get(row.attributeSetId);
    if (setId === undefined) throw new MissingNameError(ATTRIBUTE_SET_KIND, row.attributeSetId, `The store has no attribute set named ${row.attributeSetId}.`);
    if (!inSet.has(setId)) {
        const attributes = ((await ctx.get(`products/attribute-sets/${segment(setId)}/attributes`)) ?? []) as CommerceSetAttribute[];
        inSet.set(setId, new Set(attributes.map((a) => a.attribute_code ?? '')));
    }
    if (inSet.get(setId)?.has(row.attributeCode)) return;
    const groupId = await groupInSet(ctx, row.attributeSetId, setId);
    if (groupId === undefined) throw new Error(`The attribute set ${row.attributeSetId} has no group to put ${row.attributeCode} in.`);
    const id = `${setId}/${row.attributeCode}`;
    await createOne(ctx, { kind: ASSIGNMENT_KIND, key: id, id }, async () => {
        await ctx.send('POST', 'products/attribute-sets/attributes', {
            attributeSetId: setId,
            attributeGroupId: groupId,
            attributeCode: row.attributeCode,
            sortOrder: row.sortOrder ?? 0,
        });
        return { kind: ASSIGNMENT_KIND, id };
    });
    inSet.get(setId)?.add(row.attributeCode);
    ctx.log(`added ${row.attributeCode} to ${row.attributeSetId}`);
}

/** Take back one set this engine created; its own group goes with it. */
export function removeAttributeSet(send: CommerceSend, id: string): Promise<void> {
    return deleteIfPresent(send, `products/attribute-sets/${segment(id)}`);
}

/** Take one attribute this engine added back out of its set; `id` is `<set id>/<code>`. */
export function removeAssignment(send: CommerceSend, id: string): Promise<void> {
    const [setId, code] = id.split('/');
    return deleteIfPresent(send, `products/attribute-sets/${segment(setId)}/attributes/${segment(code)}`);
}
