/**
 * erpProducts — the demo ERP's product list and the discontinue PATCH, asserted on the call
 * each makes (route, method, body) and on how each reads the ERP's answer. The answer shapes
 * are the ERP's own: `GET products` → `{ items }` (`actions/products/index.js`, read
 * 2026-10-09), and a 400 in its words when a status is not one it knows.
 */

import { discontinueErpProduct, listErpProducts, setErpProductStatus } from '@/features/app-builder/services/erpProducts';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };
const URLS = { 'runtime/demo-erp/products': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/products' };

function answering(status: number, body: unknown): jest.Mock {
    return jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('listErpProducts', () => {
    it('reads GET products and keeps each row\'s sku, type and sales status', async () => {
        const fetchImpl = answering(200, {
            items: [
                { sku: 'A', type: 'simple', salesStatus: 'sellable', listPrice: 9 },
                { sku: 'P', type: 'configurable', variants: [] },
                { name: 'no sku' },
            ],
        });

        const rows = await listErpProducts(URLS, AUTH, fetchImpl as unknown as typeof fetch);

        expect(rows).toStrictEqual([
            { sku: 'A', type: 'simple', salesStatus: 'sellable' },
            { sku: 'P', type: 'configurable', salesStatus: undefined },
        ]);
        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp/products');
        expect(init.method).toBe('GET');
    });

    it('throws in the ERP\'s words when it refuses', async () => {
        const fetchImpl = answering(503, { error: 'maintenance' });
        await expect(listErpProducts(URLS, AUTH, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
            "The ERP's products answered 503: maintenance",
        );
    });

    it('refuses an ERP that deploys no products action', async () => {
        await expect(listErpProducts({}, AUTH, answering(200, {}) as unknown as typeof fetch)).rejects.toThrow(
            'The ERP deploys no "products" action.',
        );
    });
});

describe('setErpProductStatus', () => {
    it('PATCHes the product with the status asked for, sellable included', async () => {
        const fetchImpl = answering(200, { sku: 'A', salesStatus: 'sellable' });

        await setErpProductStatus(URLS, AUTH, 'A', 'sellable', fetchImpl as unknown as typeof fetch);

        const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toStrictEqual({ salesStatus: 'sellable' });
    });
});

describe('discontinueErpProduct', () => {
    it('PATCHes the product with the discontinued status', async () => {
        const fetchImpl = answering(200, { sku: 'A B', salesStatus: 'discontinued' });

        await discontinueErpProduct(URLS, AUTH, 'A B', fetchImpl as unknown as typeof fetch);

        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp/products/A%20B');
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toStrictEqual({ salesStatus: 'discontinued' });
    });

    it('throws in the ERP\'s words when the status is not one it knows yet', async () => {
        const fetchImpl = answering(400, { error: 'salesStatus must be sellable or blocked' });
        await expect(discontinueErpProduct(URLS, AUTH, 'A', fetchImpl as unknown as typeof fetch)).rejects.toThrow(
            'The ERP answered 400: salesStatus must be sellable or blocked',
        );
    });
});
