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

import { SET_LIST, WITHOUT_OWNER, WITH_OWNER, productSetPage } from '../../../helpers/commerceAssignFixtures';
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
            note: 'ServerSavvy Solutions and Kukla Studios each have their own shared catalog. Altura and RackMaster use the public one.',
        });
    });

    it('says it in words when every company has its own, or one is on the public catalog', async () => {
        expect((await check(commerce([{ id: 21, company_name: 'Kukla Studios', customer_group_id: 19 }]))).note).toBe(
            'Kukla Studios has its own shared catalog.',
        );
        expect((await check(commerce([{ id: 18, company_name: 'Altura', customer_group_id: 1 }]))).note).toBe(
            'Altura uses the public shared catalog.',
        );
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
 * erp-source-in-website-stock: the shapes are Bodea's, read 2026-09-27 before and after its
 * setup. Before: one Default Source in Default Stock (stock 1), which every website sells from.
 * After: Northwind Warehouse and East Warehouse in Bodea Stock (stock 2), which the bodea
 * website sells from. Commerce refuses a custom source in Default Stock, so a stock of the
 * website's own is what makes the ERP's warehouse sellable.
 */
describe('erp-source-in-website-stock', () => {
    const SOURCES_PATH = 'inventory/sources?searchCriteria[pageSize]=200';
    const LINKS_PATH = 'inventory/stock-source-links?searchCriteria[pageSize]=200';
    const STOCKS_PATH = 'inventory/stocks?searchCriteria[pageSize]=200';
    const DEFAULT = { source_code: 'default', name: 'Default Source', enabled: true };
    const NORTHWIND = { source_code: 'northwind', name: 'Northwind Warehouse', enabled: true };
    const DEFAULT_LINK = { stock_id: 1, source_code: 'default', priority: 1 };
    const NORTHWIND_LINK = { stock_id: 2, source_code: 'northwind', priority: 1 };
    const DEFAULT_STOCK = {
        stock_id: 1,
        name: 'Default Stock',
        extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] },
    };
    const BODEA_STOCK = {
        stock_id: 2,
        name: 'Bodea Stock',
        extension_attributes: { sales_channels: [{ type: 'website', code: 'bodea' }] },
    };

    function inventory(sources: object[], links: object[], stocks: object[] = [DEFAULT_STOCK, BODEA_STOCK]) {
        return jest.fn(async (path: string) => {
            // GET store/websites, as the sandbox answered it: the name the Admin shows.
            if (path === 'store/websites') return JSON.stringify([{ id: 3, code: 'bodea', name: 'Bodea Website' }]);
            if (path.startsWith('inventory/sources')) return JSON.stringify({ items: sources });
            if (path.startsWith('inventory/stock-source-links')) return JSON.stringify({ items: links });
            return JSON.stringify({ items: stocks });
        });
    }
    const sourceCheck = (read: (path: string) => Promise<string>) => runSetupCheck('erp-source-in-website-stock', read);

    it('reads the sources, their stock links and the stocks', async () => {
        const read = inventory([DEFAULT, NORTHWIND], [DEFAULT_LINK, NORTHWIND_LINK]);
        await sourceCheck(read);
        expect(read).toHaveBeenCalledWith(SOURCES_PATH);
        expect(read).toHaveBeenCalledWith(LINKS_PATH);
        expect(read).toHaveBeenCalledWith(STOCKS_PATH);
    });

    it('is not done with only the Default Source, as Bodea had', async () => {
        expect(await sourceCheck(inventory([DEFAULT], [DEFAULT_LINK]))).toStrictEqual({
            done: false,
            note: 'Commerce has only the Default Source.',
        });
    });

    it('is not done when the ERP source is in no stock', async () => {
        expect(await sourceCheck(inventory([DEFAULT, NORTHWIND], [DEFAULT_LINK]))).toStrictEqual({
            done: false,
            note: 'Northwind Warehouse is assigned to no stock, so no website sells from it.',
        });
    });

    it('is not done when the ERP source is in a stock no website sells from', async () => {
        const unsold = { ...BODEA_STOCK, extension_attributes: { sales_channels: [] } };
        expect(
            await sourceCheck(inventory([DEFAULT, NORTHWIND], [DEFAULT_LINK, NORTHWIND_LINK], [DEFAULT_STOCK, unsold])),
        ).toStrictEqual({ done: false, note: 'Northwind Warehouse is assigned to a stock no website sells from.' });
    });

    it('does not count a disabled source', async () => {
        const disabled = { ...NORTHWIND, enabled: false };
        expect((await sourceCheck(inventory([DEFAULT, disabled], [DEFAULT_LINK, NORTHWIND_LINK]))).done).toBe(false);
    });

    it('is done when the ERP source is in a stock a website sells from, as Bodea is now', async () => {
        expect(await sourceCheck(inventory([DEFAULT, NORTHWIND], [DEFAULT_LINK, NORTHWIND_LINK]))).toStrictEqual({
            done: true,
            note: 'Northwind Warehouse is assigned to Bodea Stock, which Bodea Website sells from.',
        });
    });

    it('cannot tell when a read failed, and passes on why', async () => {
        const failing = jest.fn(async () => 'Error: Commerce REST answered HTTP 503. busy');
        expect(await sourceCheck(failing)).toStrictEqual({ note: 'Could not check: Commerce REST answered HTTP 503. busy' });
    });
});

/*
 * erp-attributes-exist: the two product values several ERPs route and sell by. Commerce
 * answers a missing attribute with a 404 (the read hands that on as an "Error: … HTTP 404."
 * line, `commerceRestClient`), which here means "not there", not "could not check".
 */
describe('erp-attributes-exist', () => {
    const NOT_FOUND = 'Error: Commerce REST answered HTTP 404. {"message":"The attribute with a \\"%1\\" attributeCode doesn\'t exist."}';
    const OWNER = { attribute_code: 'erp_owner', frontend_input: 'text' };
    const BRAND = { attribute_code: 'brand', frontend_input: 'select' };

    /**
     * The attributes by code, and (AB-74) the products' attribute sets: every product in set 4
     * "Default", whose attributes include erp_owner unless `setHasOwner` is false. The set
     * answers are the typed fixtures in tests/helpers/commerceAssignFixtures.ts.
     */
    function attributes(byCode: Record<string, object | string>, setHasOwner = true, products: object = productSetPage([['A', 4], ['B', 4]])) {
        return jest.fn(async (path: string) => {
            if (path.startsWith('products?')) return JSON.stringify(products);
            if (path.startsWith('products/attribute-sets/sets/list')) return JSON.stringify(SET_LIST);
            if (path === 'products/attribute-sets/4/attributes') return JSON.stringify(setHasOwner ? WITH_OWNER : WITHOUT_OWNER);
            const answer = byCode[path.replace('products/attributes/', '')] ?? NOT_FOUND;
            return typeof answer === 'string' ? answer : JSON.stringify(answer);
        });
    }
    const attributeCheck = (read: (path: string) => Promise<string>) => runSetupCheck('erp-attributes-exist', read);

    it('reads both attributes by code', async () => {
        const read = attributes({ erp_owner: OWNER, brand: BRAND });
        await attributeCheck(read);
        expect(read).toHaveBeenCalledWith('products/attributes/erp_owner');
        expect(read).toHaveBeenCalledWith('products/attributes/brand');
    });

    it('is done when erp_owner is a Text Field in every set the products use and brand exists', async () => {
        expect(await attributeCheck(attributes({ erp_owner: OWNER, brand: BRAND }))).toStrictEqual({
            done: true,
            note: 'erp_owner (Text Field) and brand both exist, and erp_owner is in every attribute set your products use.',
        });
    });

    it('names the attribute sets the products use that lack erp_owner (AB-74)', async () => {
        const read = attributes({ erp_owner: OWNER, brand: BRAND }, false);
        expect(await attributeCheck(read)).toStrictEqual({
            done: false,
            note: 'erp_owner is not in the attribute set Default (2 products), so an ERP tag written to those products is dropped. Demo Builder can add it.',
        });
        expect(read).toHaveBeenCalledWith('products/attribute-sets/4/attributes');
    });

    it('cannot tell when Commerce does not say how many products it has', async () => {
        const read = attributes({ erp_owner: OWNER, brand: BRAND }, true, { items: [{ sku: 'A', attribute_set_id: 4 }] });
        expect(await attributeCheck(read)).toStrictEqual({
            note: 'Could not check the attribute sets: Commerce did not say how many products it has.',
        });
    });

    it('names each attribute Commerce does not have', async () => {
        expect(await attributeCheck(attributes({}))).toStrictEqual({
            done: false,
            note: 'Commerce has no erp_owner or brand product attribute.',
        });
        expect(await attributeCheck(attributes({ erp_owner: OWNER }))).toStrictEqual({
            done: false,
            note: 'Commerce has no brand product attribute.',
        });
    });

    it('is not done when erp_owner is a Dropdown, whose API value is a number', async () => {
        const result = await attributeCheck(attributes({ erp_owner: { ...OWNER, frontend_input: 'select' }, brand: BRAND }));
        expect(result).toStrictEqual({
            done: false,
            note: "erp_owner is a select; it must be a Text Field so it carries the ERP's id.",
        });
    });

    it('cannot tell when a read failed for another reason', async () => {
        const failing = jest.fn(async () => 'Error: Commerce REST answered HTTP 503. busy');
        expect(await attributeCheck(failing)).toStrictEqual({ note: 'Could not check: Commerce REST answered HTTP 503. busy' });
    });
});
