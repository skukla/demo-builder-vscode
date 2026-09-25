/**
 * setupChecks — the demo setup checks Demo Builder runs itself (AB-26x). Pure over the
 * Commerce read it is handed; the read's PATH is asserted, since a mocked read answers the
 * same whatever it is asked.
 */

import { runSetupCheck } from '@/features/app-builder/services/setupChecks';

const companies = (items: object[]) => jest.fn(async () => JSON.stringify({ items }));

describe('companies-have-own-catalogs', () => {
    it('reads the company list with the fields it needs', async () => {
        const read = companies([]);
        await runSetupCheck('companies-have-own-catalogs', read);
        expect(read).toHaveBeenCalledWith(
            'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]',
        );
    });

    it('is done when every company has a customer group of its own', async () => {
        const result = await runSetupCheck('companies-have-own-catalogs', companies([
            { id: 1, company_name: 'Acme', customer_group_id: 4 },
            { id: 2, company_name: 'Globex', customer_group_id: 5 },
        ]));
        expect(result).toEqual({ done: true, note: 'Each of the 2 companies has a customer group of its own.' });
    });

    it('is not done when companies share a group, and names them', async () => {
        const result = await runSetupCheck('companies-have-own-catalogs', companies([
            { id: 18, company_name: 'Acme', customer_group_id: 1 },
            { id: 20, company_name: 'Globex', customer_group_id: 1 },
            { id: 21, company_name: 'Initech', customer_group_id: 6 },
        ]));
        expect(result).toEqual({ done: false, note: 'Acme, Globex share customer group 1.' });
    });

    it('cannot tell when Commerce has no companies, and says so', async () => {
        expect(await runSetupCheck('companies-have-own-catalogs', companies([]))).toEqual({
            note: 'Commerce has no companies yet.',
        });
    });

    it('cannot tell when the read failed, and passes on why', async () => {
        const read = jest.fn(async () => 'Error: Commerce REST answered HTTP 503. busy');
        expect(await runSetupCheck('companies-have-own-catalogs', read)).toEqual({
            note: 'Could not check: Commerce REST answered HTTP 503. busy',
        });
    });

    it('reads past the page-size note the REST client may put in front of the body', async () => {
        const read = jest.fn(async () => `Showing 20 rows.\n${JSON.stringify({ items: [{ id: 1, customer_group_id: 3 }] })}`);
        expect((await runSetupCheck('companies-have-own-catalogs', read)).done).toBe(true);
    });
});
