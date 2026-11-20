/**
 * The customer and B2B kinds' names, and what a pack calls one row of each (datapack-engine step
 * 08): the key a repeat install finds a row by, and the install record keeps beside each object.
 *
 * Kept apart from the kinds themselves so `packForm.ts`, which every kind's key goes through,
 * imports nothing heavier than this.
 *
 * | Kind | Key |
 * |---|---|
 * | `customer_groups` | the group's code |
 * | `customers` | the email, lower case (Commerce compares emails without case) |
 * | `b2b_shared_catalogs` | the catalog's name |
 * | `b2b_companies` | the company's name |
 * | the three assignment kinds | `<catalog name>/<company name, category url key or SKU>` |
 *
 * @module features/data-installer/services/demoBuilderEngine/b2bKeys
 */

export const CUSTOMER_GROUP_KIND = 'customer_groups';
export const CUSTOMER_KIND = 'customers';
export const CATALOG_KIND = 'b2b_shared_catalogs';
export const COMPANY_KIND = 'b2b_companies';
export const CATALOG_COMPANIES_KIND = 'b2b_shared_catalog_company_assignments';
export const CATALOG_CATEGORIES_KIND = 'b2b_shared_catalog_categories';
export const CATALOG_PRODUCTS_KIND = 'b2b_shared_catalog_products';

/** The kinds of assignment, by what they put in a catalog. */
export type AssignmentKind = typeof CATALOG_COMPANIES_KIND | typeof CATALOG_CATEGORIES_KIND | typeof CATALOG_PRODUCTS_KIND;
export const ASSIGNMENT_KINDS: readonly AssignmentKind[] = [CATALOG_COMPANIES_KIND, CATALOG_CATEGORIES_KIND, CATALOG_PRODUCTS_KIND];

/** Whether a kind is one of the three assignment kinds. */
export const isAssignmentKind = (kind: string): kind is AssignmentKind => (ASSIGNMENT_KINDS as readonly string[]).includes(kind);

/** One assignment: a catalog by name, and what is in it by the name the pack gives it. */
export interface FlatAssignment {
    catalog: string;
    member: string;
}

/** What a pack calls a customer: its email, in lower case. */
export const customerKey = (email: string): string => email.trim().toLowerCase();

/** What a pack calls one assignment. */
export const assignmentKey = (pair: FlatAssignment): string => `${pair.catalog}/${pair.member}`;

type Row = Record<string, unknown>;
const inner = (row: unknown, outer: string, name: string): string => String(((row as Row | null)?.[outer] as Row | undefined)?.[name] ?? '');

/** Each kind's key, from a row in pack form (an assignment's from its flat pair). */
export const B2B_KEYS: Record<string, (row: unknown) => string> = {
    [CUSTOMER_GROUP_KIND]: (row) => inner(row, 'customer_group', 'code'),
    [CUSTOMER_KIND]: (row) => customerKey(inner(row, 'customer', 'email')),
    [CATALOG_KIND]: (row) => inner(row, 'sharedCatalog', 'name'),
    [COMPANY_KIND]: (row) => inner((row as { variables?: unknown } | null)?.variables, 'input', 'company_name'),
    [CATALOG_COMPANIES_KIND]: (row) => assignmentKey(row as FlatAssignment),
    [CATALOG_CATEGORIES_KIND]: (row) => assignmentKey(row as FlatAssignment),
    [CATALOG_PRODUCTS_KIND]: (row) => assignmentKey(row as FlatAssignment),
};
