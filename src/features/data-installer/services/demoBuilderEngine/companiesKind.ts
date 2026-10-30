/**
 * The `b2b_companies` kind (datapack-engine step 08; spec
 * `.rptc/research/datapack-engine/customers-b2b-spec.md` §5).
 *
 * A pack holds each company as the service's GraphQL `createCompany` call (`{ query, variables: {
 * input } }`). This engine does not send that: it writes the same company over REST, through the
 * one signed client every other kind uses, as Adobe's B2B REST reference makes one, `POST company`
 * with the admin's customer id (`super_user_id`) and the whole address block. Commerce requires
 * that block, the group, the sales representative and the admin on a company PUT (live on Bodea,
 * 2026-09-29), so an update reads the store's copy first and PUTs it back with the pack's fields
 * over it.
 *
 * - **Its admin** is the customer the pack names by email: the store's own when the website has
 *   one (Bodea's admins are all in its `customers` rows, made just before), else made here and
 *   recorded as a customer of the pack, so removal takes it back after the company.
 * - **Its group** is the public catalog's: a company sits there until a shared catalog takes it
 *   (`b2b_shared_catalog_company_assignments`). Never a bare group (owner, 2026-09-26).
 * - **Its region** is the pack's `region_id`, which every Bodea company carries; Commerce's region
 *   ids are the same on every store. A row naming its region another way is refused.
 * - `extension_attributes.quote_config.company_id` is the source store's id and is never sent.
 * - **Its status** is Active (`1`) unless the row carries its own `status`, which wins (owner,
 *   2026-10-30). Commerce makes a company sent without one Pending Approval (`0`, live 2026-10-30,
 *   `COMPANY_27_DB08`), and Adobe's "Create a company account" (Experience League, the Status
 *   field) says only an Active company's administrator and members can log in from the storefront
 *   and make purchases. The row keeps it beside the create call, never in the GraphQL `input`, so a
 *   pack published to the Data Installer still sends that service a call it takes.
 *
 * What the store already has (by name, or by email) is left alone and not recorded.
 *
 * `companyMembers` reads who is in a company, for removal's container rule: `GET hierarchy/{id}`,
 * its nodes' `entity_type` and `entity_id`. Captured 2026-10-30 for a company holding only its admin
 * (a flat list of nodes with `structure_parent_id`, `HIERARCHY_27_DB08`); a company with members was
 * not captured. Any other shape throws.
 *
 * @module features/data-installer/services/demoBuilderEngine/companiesKind
 */

import { z } from 'zod';
import { COMPANY_KIND, CUSTOMER_KIND, customerKey } from './b2bKeys';
import { PUBLIC_CATALOG_TYPE, companyByName, customerByEmail, readCatalogs } from './b2bReads';
import { deleteIfPresent, type KindContext, ownedId, parseRows, readOrNull, segment } from './kindContext';
import { createOne } from './pendingCreates';
import type { CommerceCompany, CommerceCompanyHierarchyNode, CommerceCustomer, CommerceGet, CommerceSend } from '@/types/commerceWire';

export { COMPANY_KIND } from './b2bKeys';

/** The mutation a pack's company row carries, and capture writes, as the service exports it. */
export const CREATE_COMPANY_QUERY = 'mutation CreateCompany($input: CompanyCreateInput!) { createCompany(input: $input) { company { id } } }';

const companyRows = z.array(
    z
        .object({
            query: z.string().optional(),
            variables: z.object({
                input: z
                    .object({
                        company_name: z.string().min(1),
                        company_email: z.string().email(),
                        legal_name: z.string().optional(),
                        legal_address: z.object({
                            street: z.union([z.string(), z.array(z.string())]),
                            city: z.string().min(1),
                            country_id: z.string().length(2),
                            postcode: z.string().min(1),
                            telephone: z.string().min(1),
                            region: z.object({ region_id: z.union([z.number(), z.string().regex(/^\d+$/u)]) }, { message: 'names its region by region_id' }).passthrough(),
                        }),
                        company_admin: z.object({ email: z.string().email(), firstname: z.string().min(1), lastname: z.string().min(1) }).passthrough(),
                    })
                    .passthrough(),
            }),
            extension_attributes: z.record(z.unknown()).optional(),
            /** The company's status, as Commerce numbers it (0 pending, 1 active, 2 rejected, 3 blocked). */
            status: z.number().int().min(0).max(3).optional(),
        })
        .passthrough(),
);

/** Active: a status an SC's demo buyer can sign in and buy under. */
const ACTIVE = 1;

export type CompanyRows = z.infer<typeof companyRows>;
type CompanyRow = CompanyRows[number];
type Ext = NonNullable<CommerceCompany['extension_attributes']>;

/** The pack's companies, or why they cannot be installed. */
export function parseCompanyRows(records: unknown): CompanyRows {
    return parseRows(companyRows, records, 'companies');
}

/** Quote settings without the source store's company id. */
function portableExt(ext: Record<string, unknown> | undefined): Ext | undefined {
    if (!ext) return undefined;
    const { quote_config: quote, ...rest } = ext as Ext;
    if (!quote) return rest;
    const { company_id: _id, ...config } = quote;
    return { ...rest, quote_config: config };
}

/** The pack's company fields, as Commerce's company takes them: its address block flattened. */
function companyFields(row: CompanyRow): Omit<CommerceCompany, 'super_user_id'> {
    const input = row.variables.input;
    const address = input.legal_address;
    return {
        company_name: input.company_name,
        legal_name: input.legal_name ?? input.company_name,
        company_email: input.company_email,
        street: Array.isArray(address.street) ? address.street : [address.street],
        city: address.city,
        country_id: address.country_id,
        region_id: Number(address.region.region_id),
        postcode: address.postcode,
        telephone: address.telephone,
    };
}

/** The admin's customer id: the website's own customer by that email, else one made and recorded. */
async function adminId(ctx: KindContext, admin: CompanyRow['variables']['input']['company_admin'], websiteId: number): Promise<number> {
    const existing = (await customerByEmail(ctx.get, admin.email, websiteId)) ?? (await customerByEmail(ctx.get, admin.email));
    if (existing?.id !== undefined) return existing.id;
    const customer: CommerceCustomer = { email: admin.email, firstname: admin.firstname, lastname: admin.lastname, website_id: websiteId, store_id: ctx.session.storeId };
    const key = customerKey(admin.email);
    const made = await createOne(ctx, { kind: CUSTOMER_KIND, key, find: { websiteId } }, async () => {
        const id = Number(((await ctx.send('POST', 'customers', { customer })) as CommerceCustomer | null)?.id);
        if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new company admin ${admin.email}'s id.`);
        return { kind: CUSTOMER_KIND, id: String(id), key };
    });
    ctx.log(`created customer ${key}, a company admin`);
    return Number(made.id);
}

/** Make each company the store lacks, with its admin; record it by its name. */
export async function installCompanies(ctx: KindContext, rows: CompanyRows): Promise<void> {
    const websiteId = ctx.session.websiteId;
    if (websiteId === undefined) throw new Error("The install target names no website, so the pack's companies have no admin to sign in.");
    const publicGroup = (await readCatalogs(ctx.get)).find((c) => c.type === PUBLIC_CATALOG_TYPE)?.customer_group_id;
    for (const row of rows) {
        const { company_name: name, company_email: email, company_admin: admin } = row.variables.input;
        if (ownedId(ctx.session, COMPANY_KIND, name) !== undefined || ctx.recorder.byKey(COMPANY_KIND, name)) continue;
        if (await companyByName(ctx.get, name, email)) {
            ctx.log(`left company ${name} as it is: the store already has it`);
            continue;
        }
        const superUserId = await adminId(ctx, admin, websiteId);
        const ext = portableExt(row.extension_attributes);
        const company: CommerceCompany = {
            ...companyFields(row),
            super_user_id: superUserId,
            status: row.status ?? ACTIVE,
            ...(publicGroup !== undefined ? { customer_group_id: publicGroup } : {}),
            ...(ext ? { extension_attributes: ext } : {}),
        };
        await createOne(ctx, { kind: COMPANY_KIND, key: name, find: { email }, previous: { superUserId } }, async () => {
            const id = Number(((await ctx.send('POST', 'company', { company })) as CommerceCompany | null)?.id);
            if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new company ${name}'s id.`);
            return { kind: COMPANY_KIND, id: String(id), key: name, previous: { superUserId } };
        });
        ctx.log(`created company ${name}`);
    }
}

export async function removeCompany(send: CommerceSend, id: string): Promise<void> {
    await deleteIfPresent(send, `company/${segment(id)}`);
}

/** Bring a company this engine made up to the pack: the store's whole copy, the pack's fields over it. */
export async function updateCompany(ctx: KindContext, id: string, row: unknown): Promise<void> {
    const current = await readOrNull<CommerceCompany>(ctx.get, `company/${segment(id)}`);
    if (!current) return;
    const [pack] = parseCompanyRows([row]);
    const ext = portableExt(pack.extension_attributes);
    const company: CommerceCompany = {
        ...current,
        ...companyFields(pack),
        ...(pack.status !== undefined ? { status: pack.status } : {}),
        id: current.id ?? Number(id),
        ...(ext ? { extension_attributes: { ...current.extension_attributes, ...ext, quote_config: { ...current.extension_attributes?.quote_config, ...ext.quote_config } } } : {}),
    };
    await ctx.send('PUT', `company/${segment(id)}`, { company });
}

/** A company as a pack holds it: the service's create call, its admin by name and email, its status beside the call, no ids. */
export async function companyPackForm(get: CommerceGet, raw: CommerceCompany): Promise<Record<string, unknown>> {
    const admin = raw.super_user_id === undefined ? null : await readOrNull<CommerceCustomer>(get, `customers/${segment(raw.super_user_id)}`);
    const ext = portableExt(raw.extension_attributes);
    return {
        query: CREATE_COMPANY_QUERY,
        ...(raw.status !== undefined ? { status: raw.status } : {}),
        variables: {
            input: {
                company_name: raw.company_name,
                company_email: raw.company_email,
                legal_name: raw.legal_name ?? raw.company_name,
                legal_address: {
                    street: raw.street,
                    city: raw.city,
                    country_id: raw.country_id,
                    postcode: raw.postcode,
                    telephone: raw.telephone,
                    region: { region_id: Number(raw.region_id) },
                },
                ...(admin ? { company_admin: { email: admin.email, firstname: admin.firstname, lastname: admin.lastname } } : {}),
            },
        },
        ...(ext ? { extension_attributes: ext } : {}),
    };
}

const unreadable = () => new Error('Commerce answered the company\'s hierarchy in a shape Demo Builder does not read.');

function customersIn(nodes: unknown, into: number[]): void {
    if (!Array.isArray(nodes)) throw unreadable();
    for (const node of nodes as CommerceCompanyHierarchyNode[]) {
        if (typeof node !== 'object' || node === null || node.entity_type === undefined) throw unreadable();
        if (node.entity_type === 'customer') into.push(Number(node.entity_id));
        if (node.children !== undefined) customersIn(node.children, into);
    }
}

/**
 * The customer ids in a company, from `GET hierarchy/{id}`.
 *
 * @throws Error when the answer is in a shape not read here: a removal then keeps the company
 */
export async function companyMembers(get: CommerceGet, id: string): Promise<number[]> {
    const members: number[] = [];
    customersIn(await get(`hierarchy/${segment(id)}`), members);
    return members;
}
