/**
 * A company's region in the pack's form (step 14, item 15). Commerce keeps a region id only for a
 * country with a region list; for any other it keeps the region as text. The service's export
 * falls back to that text (`dataTransformer.js` `transformB2BCompanies`); ours wrote
 * `region_id: Number(undefined)`, which is `null` in the pack.
 *
 * Kept apart from `companiesKind.test.ts`, whose install half another branch changes.
 */

import { companyPackForm } from '@/features/data-installer/services/demoBuilderEngine/companiesKind';
import type { CommerceCompany } from '@/types/commerceWire';
import { COMPANY_21, CUSTOMER_44 } from '../../../../helpers/commerceB2bFixtures';
import { fakeContext } from './demoBuilderEngine.testUtils';

type Address = { variables: { input: { legal_address: { region: Record<string, unknown> } } } };

async function regionOf(company: CommerceCompany): Promise<Record<string, unknown>> {
    const ctx = await fakeContext({ 'customers/44': CUSTOMER_44 });
    return ((await companyPackForm(ctx.get, company)) as Address).variables.input.legal_address.region;
}

describe("a company's region in the pack's form", () => {
    it('names it by id when the store keeps one', async () => {
        expect(await regionOf(COMPANY_21)).toEqual({ region_id: 44 });
    });

    it('names it by the text the store keeps when there is no region id', async () => {
        const { region_id: _id, ...rest } = COMPANY_21;

        expect(await regionOf({ ...rest, country_id: 'GB', region: 'Greater London' })).toEqual({ region: 'Greater London' });
    });

    it('reads a region id of 0 as none', async () => {
        expect(await regionOf({ ...COMPANY_21, country_id: 'GB', region_id: '0', region: 'Greater London' })).toEqual({ region: 'Greater London' });
    });

    it('writes no region at all, rather than a null id, when the store keeps neither', async () => {
        const { region_id: _id, ...rest } = COMPANY_21;

        expect(await regionOf(rest)).toStrictEqual({});
    });
});
