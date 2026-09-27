/**
 * setupChecks — the demo setup checks Demo Builder runs itself (AB-26x). Pure over the
 * Commerce read it is handed; the read's PATHS are asserted, since a mocked read answers the
 * same whatever it is asked.
 *
 * The rule (owner, 2026-09-26): every company is in a shared catalog, the public one unless it
 * gets prices of its own; a company with its own prices has a custom catalog nobody else is in.
 * The shapes are the Bodea sandbox's, read that day: catalog 1 public on group 1, custom
 * catalogs on their own groups.
 */

import { runSetupCheck } from '@/features/app-builder/services/setupChecks';

const COMPANIES_PATH =
    'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]';
const CATALOGS_PATH =
    'sharedCatalog/?searchCriteria[pageSize]=200&fields=items[id,name,customer_group_id,type]';

const PUBLIC = { id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 };
const SERVERSAVVY = { id: 12, name: 'ServerSavvy Solutions', customer_group_id: 16, type: 0 };
const KUKLA = { id: 14, name: 'Kukla Studios', customer_group_id: 19, type: 0 };

function commerce(companies: object[], catalogs: object[] = [PUBLIC, SERVERSAVVY, KUKLA]) {
    return jest.fn(async (path: string) =>
        JSON.stringify({ items: path.startsWith('company/') ? companies : catalogs }),
    );
}

const check = (read: (path: string) => Promise<string>) =>
    runSetupCheck('companies-have-own-catalogs', read);

describe('companies-have-own-catalogs', () => {
    it('reads the companies and the shared catalogs with the fields it needs', async () => {
        const read = commerce([{ id: 1, company_name: 'Acme', customer_group_id: 1 }]);
        await check(read);
        expect(read).toHaveBeenCalledWith(COMPANIES_PATH);
        expect(read).toHaveBeenCalledWith(CATALOGS_PATH);
    });

    it('is done when companies share the public catalog and priced ones have their own', async () => {
        const result = await check(commerce([
            { id: 18, company_name: 'Altura', customer_group_id: 1 },
            { id: 19, company_name: 'ServerSavvy Solutions', customer_group_id: 16 },
            { id: 20, company_name: 'RackMaster', customer_group_id: 1 },
            { id: 21, company_name: 'Kukla Studios', customer_group_id: 19 },
        ]));
        expect(result).toStrictEqual({
            done: true,
            note: 'Every company is in a shared catalog: 2 on the public one, 2 with their own.',
        });
    });

    it('is not done when a company is in a customer group no shared catalog uses', async () => {
        // The 2026-09-25 mistake: a bare group made for one company left it in no catalog.
        const result = await check(commerce([
            { id: 18, company_name: 'Altura', customer_group_id: 1 },
            { id: 21, company_name: 'Kukla Studios', customer_group_id: 18 },
        ]));
        expect(result).toStrictEqual({
            done: false,
            note: 'Kukla Studios is in no shared catalog (customer group 18 has none).',
        });
    });

    it('is not done when companies share a custom catalog, and names it', async () => {
        const result = await check(commerce([
            { id: 19, company_name: 'ServerSavvy Solutions', customer_group_id: 16 },
            { id: 22, company_name: 'Initech', customer_group_id: 16 },
        ]));
        expect(result).toStrictEqual({
            done: false,
            note: 'ServerSavvy Solutions, Initech share the custom catalog "ServerSavvy Solutions", so neither has prices of its own.',
        });
    });

    it('names every problem, not just the first', async () => {
        const result = await check(commerce([
            { id: 19, company_name: 'ServerSavvy Solutions', customer_group_id: 16 },
            { id: 22, company_name: 'Initech', customer_group_id: 16 },
            { id: 23, company_name: 'Hooli', customer_group_id: 30 },
        ]));
        expect(result.done).toBe(false);
        expect(result.note).toContain('Hooli is in no shared catalog');
        expect(result.note).toContain('share the custom catalog');
    });

    it('cannot tell when Commerce has no companies, and says so', async () => {
        expect(await check(commerce([]))).toStrictEqual({ note: 'Commerce has no companies yet.' });
    });

    it('cannot tell when either read failed, and passes on why', async () => {
        const failing = jest.fn(async () => 'Error: Commerce REST answered HTTP 503. busy');
        expect(await check(failing)).toStrictEqual({
            note: 'Could not check: Commerce REST answered HTTP 503. busy',
        });
        const catalogsFail = jest.fn(async (path: string) =>
            path.startsWith('company/')
                ? JSON.stringify({ items: [{ id: 1, company_name: 'Acme', customer_group_id: 1 }] })
                : 'Error: Commerce REST answered HTTP 404. no route',
        );
        expect(await check(catalogsFail)).toStrictEqual({
            note: 'Could not check: Commerce REST answered HTTP 404. no route',
        });
    });

    it('reads past the page-size note the REST client may put in front of the body', async () => {
        const read = jest.fn(async (path: string) =>
            `Showing 20 rows.\n${JSON.stringify({
                items: path.startsWith('company/') ? [{ id: 1, customer_group_id: 1 }] : [PUBLIC],
            })}`,
        );
        expect((await check(read)).done).toBe(true);
    });
});

/*
 * second-source-in-stock: the shapes are Bodea's, read 2026-09-27 — one Default Source linked
 * to Default Stock (stock 1), which every website sells from. A source that exists but is in
 * no stock sells nothing, so the link is what counts.
 */
describe('second-source-in-stock', () => {
    const SOURCES_PATH = 'inventory/sources?searchCriteria[pageSize]=200';
    const LINKS_PATH = 'inventory/stock-source-links?searchCriteria[pageSize]=200';
    const DEFAULT = { source_code: 'default', name: 'Default Source', enabled: true };
    const EAST = { source_code: 'east', name: 'East Warehouse', enabled: true };
    const DEFAULT_LINK = { stock_id: 1, source_code: 'default', priority: 1 };

    function inventory(sources: object[], links: object[]) {
        return jest.fn(async (path: string) =>
            JSON.stringify({ items: path.startsWith('inventory/sources') ? sources : links }),
        );
    }
    const sourceCheck = (read: (path: string) => Promise<string>) => runSetupCheck('second-source-in-stock', read);

    it('reads the sources and their stock links', async () => {
        const read = inventory([DEFAULT, EAST], [DEFAULT_LINK]);
        await sourceCheck(read);
        expect(read).toHaveBeenCalledWith(SOURCES_PATH);
        expect(read).toHaveBeenCalledWith(LINKS_PATH);
    });

    it('is not done with only the Default Source, as Bodea has', async () => {
        expect(await sourceCheck(inventory([DEFAULT], [DEFAULT_LINK]))).toStrictEqual({
            done: false,
            note: 'Commerce has only the Default Source.',
        });
    });

    it('is not done when the second source is in no stock, and names it', async () => {
        expect(await sourceCheck(inventory([DEFAULT, EAST], [DEFAULT_LINK]))).toStrictEqual({
            done: false,
            note: 'East Warehouse is in no stock, so no website sells from it.',
        });
    });

    it('does not count a disabled source', async () => {
        const disabled = { ...EAST, enabled: false };
        const links = [DEFAULT_LINK, { stock_id: 1, source_code: 'east', priority: 2 }];
        expect((await sourceCheck(inventory([DEFAULT, disabled], links))).done).toBe(false);
    });

    it('is done when a second enabled source is linked to a stock', async () => {
        const links = [DEFAULT_LINK, { stock_id: 1, source_code: 'east', priority: 2 }];
        expect(await sourceCheck(inventory([DEFAULT, EAST], links))).toStrictEqual({
            done: true,
            note: 'East Warehouse is in a stock beside the Default Source.',
        });
    });

    it('cannot tell when a read failed, and passes on why', async () => {
        const failing = jest.fn(async () => 'Error: Commerce REST answered HTTP 503. busy');
        expect(await sourceCheck(failing)).toStrictEqual({
            note: 'Could not check: Commerce REST answered HTTP 503. busy',
        });
    });
});
