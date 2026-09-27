/**
 * erpFill — Demo Builder fills the ERP from Commerce (AB-26y step 1).
 *
 * Commerce is the Bodea sandbox's own answers, captured 2026-09-27 into
 * tests/fixtures/commerce-rest/ (the same captures the integration's contract suite reads,
 * with contact details, hostnames and the tenant id replaced). The ERP's import and the
 * integration's settings are recorded, and the tests assert what was SENT, since a
 * recorded import answers the same whatever it is handed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fillErp, PRODUCT_BATCH, type ErpImportBody, type ResolvedErpSettings } from '@/features/app-builder/services/erpFill';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';

const FIXTURES = path.join(__dirname, '../../../fixtures/commerce-rest');

function captured(name: string): unknown {
    return (JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')) as { body: unknown }).body;
}

/** Which capture answers which path (the part before the query). */
const BY_PATH: Record<string, string> = {
    products: 'products-page',
    'inventory/source-items': 'source-items-accessmesh',
    'inventory/sources': 'sources',
    company: 'companies-page',
    'companyCredits/company/21': 'company-credit-21',
    'customers/44': 'customer-44',
    'store/websites': 'websites',
    'store/storeConfigs': 'store-configs',
};

/** Commerce as captured; a page past the first is empty; an uncaptured path is a 404. */
function commerce() {
    return jest.fn(async (requested: string) => {
        const [route, query = ''] = requested.split('?');
        const name = BY_PATH[route];
        if (!name) throw new CommerceReadError(`no capture for ${route}`, 404);
        if (/searchCriteria\[currentPage\]=[2-9]/u.test(query)) return { items: [], total_count: 0 };
        return captured(name);
    });
}

const ALL: ResolvedErpSettings = { default: { structure_owns: 'all' }, websites: {} };

function deps(settings: ResolvedErpSettings = ALL) {
    const sent: ErpImportBody[] = [];
    return {
        sent,
        get: commerce(),
        settings: jest.fn(async () => settings),
        importRecords: jest.fn(async (body: ErpImportBody) => {
            sent.push(body);
        }),
        onProgress: jest.fn(),
    };
}

describe('fillErp', () => {
    it("asks the integration for the settings of every website Commerce has, Admin left out", async () => {
        const d = deps();
        await fillErp(d, 'bodea');
        expect(d.settings).toHaveBeenCalledWith(['base', 'citisignal', 'bodea', 'evo']);
    });

    it('sends the customers and the structure first, then the products in batches', async () => {
        const d = deps();
        const result = await fillErp(d, 'bodea');

        expect(d.sent[0]).toStrictEqual({
            partners: expect.any(Array),
            projectName: 'bodea',
            structure: expect.any(Object),
        });
        expect(d.sent.slice(1).every((body) => Object.keys(body).join() === 'products')).toBe(true);
        expect(d.sent[1].products?.length).toBeLessThanOrEqual(PRODUCT_BATCH);
        expect(result).toStrictEqual({ partners: 4, products: 2, skipped: 0 });
    });

    it("books a company to its admin's website's sales organisation, and a company whose admin cannot be read to none", async () => {
        const d = deps({ default: {}, websites: { bodea: { structure_sales_org: 'US01' } } });
        await fillErp(d, 'bodea');
        const partners = d.sent[0].partners ?? [];
        const example = partners.find((p) => p.id === 'C21');
        expect(example).toMatchObject({
            commerceCompanyId: '21',
            creditLimit: 120_000,
            customerGroupId: '19',
            salesOrgs: ['US01'],
            website: { code: 'bodea', id: 3 },
        });
        // Altura's admin is not among the captures, so its website is unknown.
        expect(partners.find((p) => p.id === 'C18')).toMatchObject({ salesOrgs: [], website: null, creditLimit: undefined });
    });

    it('names every website in the structure with the sales organisation its settings give, else 1000', async () => {
        const d = deps({ default: {}, websites: { bodea: { structure_sales_org: 'US01', structure_sales_org_name: 'Bodea US' } } });
        await fillErp(d, 'bodea');
        const sites = d.sent[0].structure?.websites ?? [];
        expect(sites.find((s) => s.code === 'bodea')).toStrictEqual({
            code: 'bodea',
            name: 'Bodea Website',
            salesOrg: 'US01',
            salesOrgName: 'Bodea US',
            storeInfo: { address: null, countryId: 'US', currency: 'USD', vatNumber: null },
        });
        expect(sites.find((s) => s.code === 'base')?.salesOrg).toBe('1000');
    });

    it('leaves out the products another ERP owns under the ownership setting, and says what this one owns', async () => {
        // Only accessmesh is stocked anywhere in the capture, and neither captured product is it.
        const d = deps({ default: { structure_owns: 'sources', structure_owns_sources: 'east' }, websites: {} });
        const result = await fillErp(d, 'bodea');
        expect(result).toStrictEqual({ partners: 4, products: 0, skipped: 2, owns: 'products stocked in east' });
        // An empty catalogue still sends one products import: it stamps the ERP's last import.
        expect(d.sent[1]).toStrictEqual({ products: [] });
    });

    it('stops with the ERP\'s words when an import is refused', async () => {
        const d = deps();
        d.importRecords.mockRejectedValueOnce(new Error('ERP import answered 400: partners must be an array'));
        await expect(fillErp(d, 'bodea')).rejects.toThrow('partners must be an array');
    });

    it('stops when Commerce refuses a read that is not a missing endpoint', async () => {
        const d = deps();
        d.get.mockRejectedValueOnce(new CommerceReadError('Commerce REST answered HTTP 401.', 401));
        await expect(fillErp(d, 'bodea')).rejects.toThrow('401');
    });
});
