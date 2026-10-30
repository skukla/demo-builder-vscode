/**
 * Shared catalogs and what is assigned to them (datapack-engine step 08; spec
 * `.rptc/research/datapack-engine/customers-b2b-spec.md` §4, §6-8):
 *
 * - `b2b_shared_catalogs`: a catalog the store lacks is made, custom (never a second public one),
 *   with the group the pack names by code. Right after it is made, what it holds is read and
 *   recorded (`previous.held`), so removal can tell what Commerce put there from what the SC did
 *   (the setup guide's catalogs do the same, step 06). Commerce holds one catalog per customer
 *   group: when the pack's group already has one, that catalog stands in for the pack's, is
 *   never recorded, and takes the pack's assignments (step 14; the service reads Commerce's
 *   refusal the same way, and this also looks first, since the list names each catalog's group).
 * - the three assignment kinds: a company, a category (by url key) or a product (by SKU) the
 *   catalog does not hold yet is assigned, and each one assigned is recorded as its own pair,
 *   `<catalog id>/<company id | category id | SKU>`. One already there is left, and not recorded,
 *   so removal never takes out an assignment the store had. The service removed none of them.
 *
 * Commerce deletes a catalog's assignments with it; an assignment to a catalog the pack did not
 * make (Bodea assigns its categories and products to the public catalog) is taken back by
 * unassigning it.
 *
 * Pack rows of the assignment kinds group many members under a catalog. This file turns them into
 * one flat row per pair (`flatAssignments`), which is what the record, the keys and the store's
 * copies use, and back into the pack's form for capture (`groupedAssignments`).
 *
 * | Write | Endpoint | Body |
 * |---|---|---|
 * | make a catalog | `POST sharedCatalog` | `{ sharedCatalog: { name, type: 0, store_id: 0, tax_class_id, customer_group_id } }`, answers its id |
 * | remove it | `DELETE sharedCatalog/{id}` | |
 * | assign / unassign | `POST sharedCatalog/{id}/assignCompanies` (`/unassign…`) | `{ companies: [{ id }] }` |
 * | | `…/assignCategories` | `{ categories: [{ id }] }` |
 * | | `…/assignProducts` | `{ products: [{ sku }] }` |
 *
 * The writes are the routes and bodies the setup guide's catalog step already sends (its unassign
 * included), none of them run live yet. What a catalog holds is read the way that step reads it
 * (`readHeld`, live 2026-10-29).
 *
 * @module features/data-installer/services/demoBuilderEngine/sharedCatalogKinds
 */

import { z } from 'zod';
import {
    type AssignmentKind,
    CATALOG_CATEGORIES_KIND,
    CATALOG_COMPANIES_KIND,
    CATALOG_KIND,
    CATALOG_PRODUCTS_KIND,
    type FlatAssignment,
    assignmentKey,
} from './b2bKeys';
import { companyByName, readCatalogs, readHeld } from './b2bReads';
import { deleteIfPresent, isAlreadyGone, type KindContext, parseRows, ownedId, segment } from './kindContext';
import { productLookups } from './productLookups';
import type { CommerceSend, CommerceSharedCatalog } from '@/types/commerceWire';
import type { SharedCatalogHeld } from '@/types/storePreparation';

export { ASSIGNMENT_KINDS, CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND } from './b2bKeys';
export type { AssignmentKind, FlatAssignment } from './b2bKeys';

const CUSTOM_CATALOG = 0;
/** Commerce's "Retail Customer" tax class, what a new catalog takes in the Admin. */
const RETAIL_TAX_CLASS = 3;

const catalogRows = z.array(
    z.object({
        sharedCatalog: z
            .object({ name: z.string().min(1), customer_group_id: z.union([z.string(), z.number()]).optional(), tax_class_id: z.number().optional() })
            .passthrough(),
    }),
);
const companyAssignmentRows = z.array(
    z.object({ assignment: z.object({ shared_catalog_name: z.string().min(1), companies: z.array(z.object({ company_name: z.string().min(1) })) }) }),
);
const catalogCategories = z.object({ catalogs: z.array(z.object({ name: z.string().min(1), categories: z.array(z.object({ id: z.string().min(1) })) })) });
const catalogProducts = z.object({ catalogs: z.array(z.object({ name: z.string().min(1), products: z.array(z.object({ sku: z.string().min(1) })) })) });

export type CatalogRows = z.infer<typeof catalogRows>;

export const parseCatalogRows = (records: unknown): CatalogRows => parseRows(catalogRows, records, 'shared catalogs');

/** Each assignment kind's pack rows, as pairs. */
const PAIRS_OF: Record<AssignmentKind, (records: unknown) => FlatAssignment[]> = {
    [CATALOG_COMPANIES_KIND]: (records) =>
        parseRows(companyAssignmentRows, records, 'shared catalog companies').flatMap(({ assignment: a }) =>
            a.companies.map((c) => ({ catalog: a.shared_catalog_name, member: c.company_name })),
        ),
    [CATALOG_CATEGORIES_KIND]: (records) =>
        parseRows(catalogCategories, records, 'shared catalog categories').catalogs.flatMap((c) => c.categories.map((m) => ({ catalog: c.name, member: m.id }))),
    [CATALOG_PRODUCTS_KIND]: (records) =>
        parseRows(catalogProducts, records, 'shared catalog products').catalogs.flatMap((c) => c.products.map((m) => ({ catalog: c.name, member: m.sku }))),
};

/** A pack's assignment rows as one row per pair, each pair once (Bodea lists `racks` twice). */
export function flatAssignments(kind: AssignmentKind, records: unknown): FlatAssignment[] {
    const seen = new Set<string>();
    return PAIRS_OF[kind](records).filter((pair) => {
        const key = assignmentKey(pair);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Pairs back in the pack's own form, grouped by catalog in the order they came. */
export function groupedAssignments(kind: AssignmentKind, pairs: readonly FlatAssignment[]): unknown {
    const byCatalog = new Map<string, string[]>();
    for (const { catalog, member } of pairs) byCatalog.set(catalog, [...(byCatalog.get(catalog) ?? []), member]);
    const groups = [...byCatalog];
    if (kind === CATALOG_COMPANIES_KIND) {
        return groups.map(([name, members]) => ({ assignment: { shared_catalog_name: name, companies: members.map((company_name) => ({ company_name })) } }));
    }
    if (kind === CATALOG_CATEGORIES_KIND) return { catalogs: groups.map(([name, members]) => ({ name, categories: members.map((id) => ({ id })) })) };
    return { catalogs: groups.map(([name, members]) => ({ name, products: members.map((sku) => ({ sku })) })) };
}

/**
 * Commerce's refusal of a second catalog for one customer group, in the service's words
 * (`SharedCatalogImportProcessor.js` L9-32). Read off the service, not a captured answer.
 */
const GROUP_HAS_CATALOG = /a catalog already exists with customer group/iu;

/** What `POST sharedCatalog` answered, or `undefined` when Commerce refused it as the group's second. */
async function postCatalog(ctx: KindContext, sharedCatalog: CommerceSharedCatalog): Promise<unknown> {
    try {
        return await ctx.send('POST', 'sharedCatalog', { sharedCatalog });
    } catch (error) {
        if (error instanceof Error && GROUP_HAS_CATALOG.test(error.message)) return undefined;
        throw error;
    }
}

/**
 * Use the store's catalog for the group in place of the pack's: Commerce holds one per customer
 * group. Nothing is recorded, so removal never takes the store's catalog.
 */
function useStandIn(ctx: KindContext, name: string, catalog: CommerceSharedCatalog | undefined): void {
    if (catalog?.id === undefined) {
        ctx.log(`left shared catalog ${name} out: its customer group already has a catalog`);
        return;
    }
    (ctx.session.catalogStandIns ??= new Map()).set(name, catalog.id);
    ctx.log(`used shared catalog ${catalog.name} for ${name}: its customer group already has that catalog`);
}

/** The store's catalog for a customer group, if it has one. */
const catalogOfGroup = (catalogs: readonly CommerceSharedCatalog[], group: number | undefined) =>
    group === undefined ? undefined : catalogs.find((c) => c.customer_group_id === group);

/** Make each catalog the store lacks, custom, and record it with what it held when made. */
export async function installCatalogs(ctx: KindContext, rows: CatalogRows): Promise<void> {
    const existing = await readCatalogs(ctx.get);
    const lk = productLookups(ctx);
    for (const { sharedCatalog: row } of rows) {
        if (ownedId(ctx.session, CATALOG_KIND, row.name) !== undefined || ctx.recorder.byKey(CATALOG_KIND, row.name)) continue;
        if (existing.some((c) => c.name === row.name)) continue;
        const group = row.customer_group_id === undefined ? undefined : await lk.groupId(String(row.customer_group_id));
        if (catalogOfGroup(existing, group)) {
            useStandIn(ctx, row.name, catalogOfGroup(existing, group));
            continue;
        }
        const sharedCatalog: CommerceSharedCatalog = {
            name: row.name,
            type: CUSTOM_CATALOG,
            store_id: 0,
            tax_class_id: row.tax_class_id ?? RETAIL_TAX_CLASS,
            ...(group !== undefined ? { customer_group_id: group } : {}),
        };
        const answer = await postCatalog(ctx, sharedCatalog);
        if (answer === undefined) {
            useStandIn(ctx, row.name, catalogOfGroup(await readCatalogs(ctx.get), group));
            continue;
        }
        const id = Number(answer);
        if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new shared catalog ${row.name}'s id.`);
        // A failed read-back records no `held`: removal then counts everything in it as not the pack's.
        const held = await readHeld(ctx.get, id).catch(() => undefined);
        await ctx.recorder.record({ kind: CATALOG_KIND, id: String(id), key: row.name, ...(held ? { previous: { held } } : {}) });
        ctx.log(`created shared catalog ${row.name}`);
    }
}

export async function removeCatalog(send: CommerceSend, id: string): Promise<void> {
    await deleteIfPresent(send, `sharedCatalog/${segment(id)}`);
}

/** How each kind names a member to Commerce, and the route and body that assign one. */
const ROUTES: Record<AssignmentKind, { verb: string; list: keyof SharedCatalogHeld; body: (refs: string[]) => unknown }> = {
    [CATALOG_COMPANIES_KIND]: { verb: 'Companies', list: 'companies', body: (refs) => ({ companies: refs.map((id) => ({ id: Number(id) })) }) },
    [CATALOG_CATEGORIES_KIND]: { verb: 'Categories', list: 'categories', body: (refs) => ({ categories: refs.map((id) => ({ id: Number(id) })) }) },
    [CATALOG_PRODUCTS_KIND]: { verb: 'Products', list: 'products', body: (refs) => ({ products: refs.map((sku) => ({ sku })) }) },
};

/** This store's id (or SKU) for a member the pack names. */
async function memberRef(ctx: KindContext, kind: AssignmentKind, member: string): Promise<string> {
    if (kind === CATALOG_PRODUCTS_KIND) return member;
    if (kind === CATALOG_CATEGORIES_KIND) return productLookups(ctx).categoryId(member);
    const company = await companyByName(ctx.get, member);
    if (!company) throw new Error(`The store has no company named ${member}.`);
    return String(company.id);
}

/** Assign what each catalog does not hold yet, one call per catalog; record each pair assigned. */
export async function installAssignments(ctx: KindContext, kind: AssignmentKind, records: unknown): Promise<void> {
    const pairs = flatAssignments(kind, records);
    const catalogs = await readCatalogs(ctx.get);
    const route = ROUTES[kind];
    for (const name of new Set(pairs.map((p) => p.catalog))) {
        const standIn = ctx.session.catalogStandIns?.get(name);
        const catalog = catalogs.find((c) => c.name === name) ?? catalogs.find((c) => standIn !== undefined && c.id === standIn);
        if (catalog?.id === undefined) throw new Error(`The store has no shared catalog named ${name}.`);
        const held = new Set((await readHeld(ctx.get, catalog.id))[route.list].map(String));
        const adding: Array<{ ref: string; key: string }> = [];
        for (const pair of pairs.filter((p) => p.catalog === name)) {
            const key = assignmentKey(pair);
            if (ownedId(ctx.session, kind, key) !== undefined) continue;
            const ref = await memberRef(ctx, kind, pair.member);
            if (!held.has(ref) && !adding.some((a) => a.ref === ref)) adding.push({ ref, key });
        }
        if (adding.length === 0) continue;
        await ctx.send('POST', `sharedCatalog/${segment(catalog.id)}/assign${route.verb}`, route.body(adding.map((a) => a.ref)));
        for (const { ref, key } of adding) await ctx.recorder.record({ kind, id: `${catalog.id}/${ref}`, key });
        ctx.log(`assigned ${adding.length} to shared catalog ${name}`);
    }
}

/** A recorded pair, split: the catalog's id and the member's id or SKU (which may hold a slash). */
export function splitPair(id: string): { catalogId: string; ref: string } {
    const slash = id.indexOf('/');
    return { catalogId: id.slice(0, slash), ref: id.slice(slash + 1) };
}

/** Take one assignment this engine made back out; a catalog already gone took it with it. */
export async function removeAssignmentPair(send: CommerceSend, kind: AssignmentKind, id: string): Promise<void> {
    const { catalogId, ref } = splitPair(id);
    try {
        await send('POST', `sharedCatalog/${segment(catalogId)}/unassign${ROUTES[kind].verb}`, ROUTES[kind].body([ref]));
    } catch (error) {
        if (!isAlreadyGone(error)) throw error;
    }
}
