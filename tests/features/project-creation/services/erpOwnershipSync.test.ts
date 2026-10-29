/**
 * erpOwnershipSync — what "Add another ERP" reads before the add and saves on Add (AB-64).
 *
 * Commerce is the Bodea sandbox's captured answers (tests/fixtures/commerce-rest/); the
 * integration's `erp/settings` and `erp/erps` are a fetch fake, so the exact PATCH body each
 * ERP's rule saves is asserted, and the read's product rows are asserted against the capture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    readErpOwnershipOptions,
    saveErpOwnership,
} from '@/features/project-creation/services/erpOwnershipSync';

const FIXTURES = path.join(__dirname, '../../../fixtures/commerce-rest');

function captured(name: string): unknown {
    return (JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')) as { body: unknown }).body;
}

const BY_PATH: Record<string, string> = {
    products: 'products-page',
    'inventory/source-items': 'source-items-accessmesh',
    'inventory/sources': 'sources',
    'store/websites': 'websites',
};

function commerce() {
    return jest.fn(async (requested: string) => {
        const [route, query = ''] = requested.split('?');
        const name = BY_PATH[route];
        if (!name) throw new CommerceReadError(`no capture for ${route}`, 404);
        if (/searchCriteria\[currentPage\]=[2-9]/u.test(query)) return { items: [], total_count: 0 };
        return captured(name);
    });
}

const URLS = { 'runtime/erp/erps': 'https://ns.adobeioruntime.net/api/v1/web/erp/erps', 'runtime/erp/settings': 'https://ns.adobeioruntime.net/api/v1/web/erp/settings' };
const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

/** The integration: settings per ERP by list id, and a PATCH that records its body. */
function integration(settingsByErp: Record<string, Record<string, string>>) {
    const patched: unknown[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/erp/settings')) {
            const erp = new URL(url).searchParams.get('erp') ?? '';
            return new Response(JSON.stringify({ default: settingsByErp[erp] ?? {}, websites: {} }), { status: 200 });
        }
        if (url.endsWith('/erp/erps') && init?.method === 'PATCH') {
            patched.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ entry: { id: 'x' } }), { status: 200 });
        }
        return new Response('{"error":"unexpected"}', { status: 500 });
    });
    return { patched, client: new ErpIntegrationClient(URLS, AUTH, fetchImpl as unknown as typeof fetch) };
}

describe('readErpOwnershipOptions', () => {
    it("answers the store's websites, each product's codes, and each ERP's rule", async () => {
        const { client } = integration({
            acme: { structure_owns: 'websites', structure_owns_websites: 'base' },
            'brand-b': {},
        });
        const options = await readErpOwnershipOptions(
            { get: commerce(), client },
            [{ listId: 'acme', name: 'Acme ERP' }, { listId: 'brand-b', name: 'Brand B ERP' }],
        );

        expect(options.websites).toStrictEqual([
            { code: 'base', name: 'Main Website' },
            { code: 'citisignal', name: 'CitiSignal Website' },
            { code: 'bodea', name: 'Bodea Website' },
            { code: 'evo', name: 'Evo' },
        ]);
        // Both captured products are on website 2 (citisignal).
        expect(options.products).toStrictEqual([
            { sku: 'essentials-plan', websiteCodes: ['citisignal'], attributes: {} },
            { sku: 'DigiWristQuantum', websiteCodes: ['citisignal'], attributes: {} },
        ]);
        expect(options.erps).toStrictEqual([
            { erp: 'acme', name: 'Acme ERP', owns: { mode: 'websites', websites: ['base'] } },
            { erp: 'brand-b', name: 'Brand B ERP', owns: { mode: 'all' } },
        ]);
        expect(options.takenListIds).toStrictEqual(['acme', 'brand-b']);
    });

    it("carries the attribute an existing ERP's rule names, and erp_owner always", async () => {
        const get = commerce();
        const products = captured('products-page') as { items: Array<{ custom_attributes?: unknown[] }> };
        products.items[0].custom_attributes = [
            { attribute_code: 'brand', value: 'bodea' },
            { attribute_code: 'erp_owner', value: 'acme' },
            { attribute_code: 'description', value: '<p>long</p>' },
        ];
        get.mockImplementation(async (requested: string) =>
            requested.startsWith('products?') && !/currentPage\]=[2-9]/u.test(requested)
                ? products
                : commerce()(requested),
        );
        const { client } = integration({ acme: { structure_owns: 'attribute', structure_owns_attribute: 'brand=bodea' } });

        const options = await readErpOwnershipOptions({ get, client }, [{ listId: 'acme', name: 'Acme ERP' }]);

        expect(options.products[0].attributes).toStrictEqual({ brand: 'bodea', erp_owner: 'acme' });
    });
});

describe('saveErpOwnership', () => {
    it("PATCHes each ERP's entry with its mode and the one key the mode reads, in order", async () => {
        const { client, patched } = integration({});

        await saveErpOwnership(client, [
            { erp: 'brand-b', owns: { mode: 'websites', websites: ['justrite', 'evo'] } },
            { erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } },
        ]);

        expect(patched).toStrictEqual([
            { id: 'brand-b', values: { structure_owns: 'websites', structure_owns_websites: 'justrite,evo' } },
            { id: 'acme', values: { structure_owns: 'attribute', structure_owns_attribute: 'erp_owner=acme' } },
        ]);
    });

    it("throws in the integration's words when a save is refused, naming the ERP", async () => {
        const client = new ErpIntegrationClient(URLS, AUTH, (async () =>
            new Response('{"error":"no ERP brand-b"}', { status: 404 })) as unknown as typeof fetch);

        await expect(saveErpOwnership(client, [{ erp: 'brand-b', owns: { mode: 'all' } }]))
            .rejects.toThrow("brand-b's ownership was not saved: ERP erps answered 404: no ERP brand-b");
    });
});
