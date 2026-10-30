/**
 * Capture for the customer and B2B kinds (datapack-engine step 08): what "Save store changes to
 * this pack" reads beside the catalog (`capture.ts`).
 *
 * As for the catalog kinds, it reads what the install record lists, the installed version's own
 * rows found again by the names it gives them (group codes, customer emails, catalog and company
 * names), and what those need to install on an empty store:
 *
 * - a company's admin, as a customer;
 * - every group a captured customer, catalog or product tier price names, but Commerce's own
 *   (`NOT LOGGED IN`, `General`, `Wholesale`, `Retailer`, as the service's export leaves out);
 * - for every catalog captured or named by the installed version's assignments (the public one
 *   included), what it holds of the companies, categories and products captured, and nothing else.
 *
 * A captured customer has no password: Commerce never answers one. Installing the saved version
 * makes its buyers without one (decision for the owner, step 08 plan). Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/captureB2b
 */

import {
    ASSIGNMENT_KINDS,
    type AssignmentKind,
    CATALOG_CATEGORIES_KIND,
    CATALOG_COMPANIES_KIND,
    CATALOG_KIND,
    CATALOG_PRODUCTS_KIND,
    COMPANY_KIND,
    CUSTOMER_GROUP_KIND,
    CUSTOMER_KIND,
    type FlatAssignment,
} from './b2bKeys';
import { PUBLIC_CATALOG_TYPE, companyByName, customerByEmail, groupByCode, readCatalogs, readHeld } from './b2bReads';
import { b2bRowsOf, catalogPackForm } from './b2bStoreCopies';
import { companyPackForm } from './companiesKind';
import { customerPackForm, groupPackForm } from './customerKinds';
import type { CreatedObject } from './installRecord';
import { type KindContext, readOrNull, segment } from './kindContext';
import type { ProductLookups } from './productLookups';
import { groupedAssignments, splitPair } from './sharedCatalogKinds';
import type { CommerceCompany, CommerceCustomer, CommerceCustomerGroup, CommerceSharedCatalog } from '@/types/commerceWire';

/** Commerce's own groups, which every store has and a pack never carries (export exclusions). */
const COMMERCE_GROUPS = new Set(['NOT LOGGED IN', 'General', 'Default (General)', 'Wholesale', 'Retailer']);

/** What the catalog capture found, which the assignments are limited to. */
export interface CapturedCatalog {
    skus: readonly string[];
    /** The url keys of the categories captured. */
    categoryKeys: ReadonlySet<string>;
    /** The group ids the captured products' tier prices name. */
    tierGroups: ReadonlyArray<number | string>;
}

type Row = Record<string, unknown>;
const idsOf = (created: readonly CreatedObject[], kind: string): string[] => created.filter((o) => o.kind === kind).map((o) => o.id);
const rowsOf = (installed: Record<string, unknown>, kind: string): Row[] => (Array.isArray(installed[kind]) ? (installed[kind] as Row[]) : []);
const inner = (row: Row, outer: string, name: string): string | undefined => {
    const value = (row[outer] as Row | undefined)?.[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
};
const defined = <T>(values: Array<T | undefined>): T[] => values.filter((v): v is T => v !== undefined);

async function readEach<T>(ctx: KindContext, route: string, ids: Iterable<string>): Promise<T[]> {
    const found = await Promise.all([...new Set(ids)].map((id) => readOrNull<T>(ctx.get, `${route}/${segment(id)}`)));
    return found.filter((v): v is Awaited<T> => v !== null) as T[];
}

async function captureCompanies(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown>): Promise<CommerceCompany[]> {
    const names = defined(rowsOf(installed, COMPANY_KIND).map((r) => inner((r.variables as Row | undefined) ?? {}, 'input', 'company_name')));
    const found = await Promise.all(names.map((name) => companyByName(ctx.get, name)));
    return readEach<CommerceCompany>(ctx, 'company', [...idsOf(created, COMPANY_KIND), ...defined(found).map((c) => String(c.id))]);
}

async function captureCustomers(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown>, companies: CommerceCompany[]): Promise<CommerceCustomer[]> {
    const emails = defined(rowsOf(installed, CUSTOMER_KIND).map((r) => inner(r, 'customer', 'email')));
    const found = await Promise.all(emails.map((email) => customerByEmail(ctx.get, email, ctx.session.websiteId)));
    const admins = defined(companies.map((c) => c.super_user_id)).map(String);
    return readEach<CommerceCustomer>(ctx, 'customers', [...idsOf(created, CUSTOMER_KIND), ...defined(found.map((c) => c?.id)).map(String), ...admins]);
}

function capturedCatalogs(created: readonly CreatedObject[], installed: Record<string, unknown>, all: CommerceSharedCatalog[]): CommerceSharedCatalog[] {
    const names = new Set(defined(rowsOf(installed, CATALOG_KIND).map((r) => inner(r, 'sharedCatalog', 'name'))));
    const ids = new Set(idsOf(created, CATALOG_KIND));
    return all.filter((c) => c.type !== PUBLIC_CATALOG_TYPE && (ids.has(String(c.id)) || names.has(c.name)));
}

async function captureGroups(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown>, named: Array<number | string | undefined>): Promise<CommerceCustomerGroup[]> {
    const codes = defined(rowsOf(installed, CUSTOMER_GROUP_KIND).map((r) => inner(r, 'customer_group', 'code')));
    const byCode = await Promise.all(codes.map((code) => groupByCode(ctx.get, code)));
    const ids = [...idsOf(created, CUSTOMER_GROUP_KIND), ...defined(byCode.map((g) => g?.id)), ...defined(named)].map(String);
    return (await readEach<CommerceCustomerGroup>(ctx, 'customerGroups', ids)).filter((g) => !COMMERCE_GROUPS.has(g.code));
}

/** The catalogs whose assignments are captured: the ones captured, and any the installed version's assignments or the record name. */
function assignmentCatalogs(created: readonly CreatedObject[], installed: Record<string, unknown>, all: CommerceSharedCatalog[], captured: CommerceSharedCatalog[]): CommerceSharedCatalog[] {
    const names = new Set(captured.map((c) => c.name));
    const ids = new Set(captured.map((c) => String(c.id)));
    for (const kind of ASSIGNMENT_KINDS) {
        for (const pair of (b2bRowsOf(kind, installed[kind]) ?? []) as FlatAssignment[]) names.add(pair.catalog);
        for (const id of idsOf(created, kind)) ids.add(splitPair(id).catalogId);
    }
    return all.filter((c) => names.has(c.name) || ids.has(String(c.id)));
}

async function captureAssignments(ctx: KindContext, lk: ProductLookups, catalogs: CommerceSharedCatalog[], companies: CommerceCompany[], catalog: CapturedCatalog): Promise<Record<string, unknown>> {
    const companyNames = new Map(companies.map((c) => [String(c.id), c.company_name]));
    const pairs: Record<AssignmentKind, FlatAssignment[]> = { [CATALOG_COMPANIES_KIND]: [], [CATALOG_CATEGORIES_KIND]: [], [CATALOG_PRODUCTS_KIND]: [] };
    for (const each of catalogs) {
        if (each.id === undefined) continue;
        const held = await readHeld(ctx.get, each.id);
        for (const id of held.companies.map(String)) {
            const name = companyNames.get(id);
            if (name) pairs[CATALOG_COMPANIES_KIND].push({ catalog: each.name, member: name });
        }
        for (const id of held.categories) {
            const key = await lk.categoryUrlKey(id);
            if (key && catalog.categoryKeys.has(key)) pairs[CATALOG_CATEGORIES_KIND].push({ catalog: each.name, member: key });
        }
        pairs[CATALOG_PRODUCTS_KIND].push(...held.products.filter((sku) => catalog.skus.includes(sku)).map((sku) => ({ catalog: each.name, member: sku })));
    }
    return Object.fromEntries(ASSIGNMENT_KINDS.filter((kind) => pairs[kind].length > 0).map((kind) => [kind, groupedAssignments(kind, pairs[kind])]));
}

const B2B_KINDS: readonly string[] = [CUSTOMER_GROUP_KIND, CUSTOMER_KIND, CATALOG_KIND, COMPANY_KIND, ...ASSIGNMENT_KINDS];

function touchesB2b(created: readonly CreatedObject[], installed: Record<string, unknown>, catalog: CapturedCatalog): boolean {
    return catalog.tierGroups.length > 0 || created.some((o) => B2B_KINDS.includes(o.kind)) || B2B_KINDS.some((kind) => kind in installed);
}

/**
 * The customer and B2B rows of a capture.
 *
 * @param created - what the install record lists
 * @param installed - the installed version's own rows, by kind
 * @param catalog - what the catalog capture took, which the assignments are limited to
 */
export async function captureB2b(
    ctx: KindContext,
    lk: ProductLookups,
    created: readonly CreatedObject[],
    installed: Record<string, unknown>,
    catalog: CapturedCatalog,
): Promise<Record<string, unknown>> {
    // A pack with no customers, groups or B2B, and no tier price naming a group: nothing to read.
    if (!touchesB2b(created, installed, catalog)) return {};
    const companies = await captureCompanies(ctx, created, installed);
    const customers = await captureCustomers(ctx, created, installed, companies);
    const all = await readCatalogs(ctx.get);
    const catalogs = capturedCatalogs(created, installed, all);
    const groups = await captureGroups(ctx, created, installed, [...customers.map((c) => c.group_id), ...catalogs.map((c) => c.customer_group_id), ...catalog.tierGroups]);
    const rows: Record<string, unknown[]> = {
        [CUSTOMER_GROUP_KIND]: groups.map(groupPackForm),
        [CUSTOMER_KIND]: await Promise.all(customers.map((c) => customerPackForm(lk, c))),
        [CATALOG_KIND]: await Promise.all(catalogs.map((c) => catalogPackForm(lk, c))),
        [COMPANY_KIND]: await Promise.all(companies.map((c) => companyPackForm(ctx.get, c))),
    };
    return {
        ...Object.fromEntries(Object.entries(rows).filter(([, list]) => list.length > 0)),
        ...(await captureAssignments(ctx, lk, assignmentCatalogs(created, installed, all, catalogs), companies, catalog)),
    };
}
