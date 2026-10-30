/**
 * The `b2b_companies` kind (datapack-engine step 08): a pack's company, made over REST with its
 * admin and the whole address block, and taken back by its id.
 *
 * The row is Bodea's, contact details replaced. The store's copy is the captured `GET company/21`
 * and its admin the captured `GET customers/44`. The searches, the hierarchy and the POST's answer
 * are not captured; each is built here in the shape of those bodies.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import {
    COMPANY_KIND,
    companyMembers,
    companyPackForm,
    installCompanies,
    parseCompanyRows,
    removeCompany,
    updateCompany,
} from '@/features/data-installer/services/demoBuilderEngine/companiesKind';
import { CUSTOMER_KIND } from '@/features/data-installer/services/demoBuilderEngine/customerKinds';
import type { CommerceCompanyHierarchyNode } from '@/types/commerceWire';
import { BODEA_COMPANY_ROW, CATALOG_14, COMPANY_21, CREATE_COMPANY_QUERY, CUSTOMER_44 } from '../../../../helpers/commerceB2bFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const ADMIN = 'admin.altura@example.com';
const byName = page('company', filterBy('company_name', 'Altura'));
const byEmail = page('company', filterBy('company_email', 'office.altura@example.com'));
const adminSearch = page('customers/search', filterBy('email', ADMIN));
const CATALOGS = page('sharedCatalog');
const PUBLIC = { id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 };

async function store(parts: { companies?: unknown[]; admins?: unknown[] } = {}) {
    const ctx = await fakeContext(
        {
            [byName]: { items: parts.companies ?? [] },
            [byEmail]: { items: [] },
            [adminSearch]: { items: parts.admins ?? [] },
            [CATALOGS]: { items: [PUBLIC, CATALOG_14] },
        },
        (call) => (call.path === 'customers' ? { ...CUSTOMER_44, id: 60 } : { ...COMPANY_21, id: 30 }),
    );
    ctx.session.websiteId = 3;
    ctx.session.storeId = 4;
    return ctx;
}

describe('installCompanies', () => {
    it('makes the company with its admin, its whole address and the public catalog\'s group, and records it', async () => {
        const ctx = await store({ admins: [{ ...CUSTOMER_44, id: 52, email: ADMIN, website_id: 3 }] });

        await installCompanies(ctx, parseCompanyRows([BODEA_COMPANY_ROW]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'company',
                body: {
                    company: {
                        company_name: 'Altura',
                        legal_name: 'Altura',
                        company_email: 'office.altura@example.com',
                        street: ['1 Demo Way'],
                        city: 'Springfield',
                        country_id: 'US',
                        region_id: 12,
                        postcode: '12345',
                        telephone: '5550100',
                        super_user_id: 52,
                        customer_group_id: 1,
                        extension_attributes: { quote_config: { is_quote_enabled: true }, is_purchase_order_enabled: true },
                    },
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: COMPANY_KIND, id: '30', key: 'Altura', previous: { superUserId: 52 } }]);
    });

    it('makes the admin first when the store has no customer by that email, and records it as a customer', async () => {
        const ctx = await store();

        await installCompanies(ctx, parseCompanyRows([BODEA_COMPANY_ROW]));

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['POST customers', 'POST company']);
        expect(ctx.sent[0].body).toEqual({ customer: { email: ADMIN, firstname: 'Alex', lastname: 'Altura', website_id: 3, store_id: 4 } });
        expect(ctx.recorder.created.map((o) => [o.kind, o.id, o.key])).toEqual([
            [CUSTOMER_KIND, '60', ADMIN],
            [COMPANY_KIND, '30', 'Altura'],
        ]);
    });

    it('leaves a company the store has by that name', async () => {
        const ctx = await store({ companies: [{ id: 5, company_name: 'Altura' }] });

        await installCompanies(ctx, parseCompanyRows([BODEA_COMPANY_ROW]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it("drops the source store's company id from its quote settings", async () => {
        const ctx = await store({ admins: [{ ...CUSTOMER_44, email: ADMIN }] });
        const row = { ...BODEA_COMPANY_ROW, extension_attributes: { quote_config: { company_id: '21', is_quote_enabled: true } } };

        await installCompanies(ctx, parseCompanyRows([row]));

        expect((ctx.sent[0].body as { company: { extension_attributes: unknown } }).company.extension_attributes).toEqual({ quote_config: { is_quote_enabled: true } });
    });

    it('refuses a company whose address names no region id, before anything is sent', () => {
        const input = { ...BODEA_COMPANY_ROW.variables.input, legal_address: { ...BODEA_COMPANY_ROW.variables.input.legal_address, region: { region_code: 'CA' } } };

        expect(() => parseCompanyRows([{ ...BODEA_COMPANY_ROW, variables: { input } }])).toThrow(/companies/);
    });
});

describe('the store\'s copy', () => {
    it("reads the captured company back in the pack's form, its admin by name and email, no ids", async () => {
        const ctx = await fakeContext({ 'customers/44': CUSTOMER_44 });

        expect(await companyPackForm(ctx.get, COMPANY_21)).toEqual({
            query: CREATE_COMPANY_QUERY,
            variables: {
                input: {
                    company_name: 'Example Studios',
                    company_email: 'company@example.com',
                    legal_name: 'Example Studios, LLC',
                    legal_address: { street: ['1 Demo Way'], city: 'Springfield', country_id: 'US', postcode: '12345', telephone: '5550100', region: { region_id: 44 } },
                    company_admin: { email: 'buyer@example.com', firstname: 'Test', lastname: 'Buyer' },
                },
            },
            extension_attributes: {
                is_purchase_order_enabled: false,
                is_company_address_book_enabled: false,
                is_custom_shipping_address_allowed: false,
                quote_config: { is_quote_enabled: true },
            },
        });
    });
});

describe('removal and update', () => {
    it('is taken back by its id', async () => {
        const ctx = await fakeContext({});

        await removeCompany(ctx.send, '30');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'company/30', body: undefined }]);
    });

    it("is brought up to the pack by PUTting the store's whole copy back with the pack's fields over it", async () => {
        const ctx = await fakeContext({ 'company/21': COMPANY_21 });
        const input = { ...BODEA_COMPANY_ROW.variables.input, company_name: 'Example Studios', telephone: undefined };
        const row = { ...BODEA_COMPANY_ROW, variables: { input: { ...input, legal_address: { ...input.legal_address, city: 'Shelbyville' } } } };

        await updateCompany(ctx, '21', row);

        const [{ method, path, body }] = ctx.sent;
        expect([method, path]).toEqual(['PUT', 'company/21']);
        // The fields Commerce requires on a PUT (live 2026-09-29) all travel: group, rep, admin, address.
        expect((body as { company: unknown }).company).toMatchObject({
            id: 21,
            city: 'Shelbyville',
            customer_group_id: 19,
            sales_representative_id: 1,
            super_user_id: 44,
            region_id: 12,
            extension_attributes: { quote_config: { company_id: '21', is_quote_enabled: true }, is_purchase_order_enabled: true },
        });
    });
});

describe('companyMembers', () => {
    it("lists the customers anywhere in the company's tree, not its teams", async () => {
        const tree: CommerceCompanyHierarchyNode[] = [
            { structure_id: 1, entity_id: 44, entity_type: 'customer', children: [{ entity_id: 7, entity_type: 'team', children: [{ entity_id: 61, entity_type: 'customer' }] }] },
        ];
        const ctx = await fakeContext({ 'hierarchy/21': tree });

        expect(await companyMembers(ctx.get, '21')).toEqual([44, 61]);
    });

    it('refuses an answer in any other shape, so a removal cannot read it as empty', async () => {
        const ctx = await fakeContext({ 'hierarchy/21': { message: 'unexpected' } });

        await expect(companyMembers(ctx.get, '21')).rejects.toThrow(/shape/);
    });
});
