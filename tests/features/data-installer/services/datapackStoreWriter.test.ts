/**
 * The store writer: create-datapack and add-data-item, against either store.
 *
 * The request is the thing under test, so every test asserts the URL, the headers
 * and the body actually sent — a mocked store answers the same whatever it is handed.
 */

import { DatapackStoreWriter } from '@/features/data-installer/services/datapackStoreWriter';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';

const BASE = 'https://store.example.test/api/v1/web/datapack-store';

function reply(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    } as Response;
}

function writer(fetchImpl: jest.Mock, log?: jest.Mock): DatapackStoreWriter {
    return new DatapackStoreWriter({
        baseUrl: BASE,
        getToken: async () => 'sc-token',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ...(log ? { log } : {}),
    });
}

function sent(
    fetchImpl: jest.Mock,
    call = 0
): { url: string; init: RequestInit; body: Record<string, unknown> } {
    const [url, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

describe('createDatapack', () => {
    it('POSTs create-datapack with the pack identity, private, under the caller token', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(201, { success: true }));

        const result = await writer(fetchImpl).createDatapack({
            id: { name: 'justrite', version: 'v1' },
            displayName: 'Justrite B2B',
            description: 'Signs',
        });

        expect(result).toBe('created');
        const { url, init, body } = sent(fetchImpl);
        expect(url).toBe(`${BASE}/create-datapack`);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
            Authorization: 'Bearer sc-token',
            'Content-Type': 'application/json',
        });
        expect(body).toEqual({
            datapack_name: 'justrite',
            version: 'v1',
            display_name: 'Justrite B2B',
            description: 'Signs',
            shared: false,
        });
    });

    it('answers exists on the store 409, rather than throwing', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(reply(409, { success: false, error: 'already exists' }));

        await expect(
            writer(fetchImpl).createDatapack({
                id: { name: 'justrite', version: 'v1' },
                displayName: 'J',
            })
        ).resolves.toBe('exists');
    });

    it('throws any other refusal with the store sentence', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(reply(400, { success: false, error: 'Invalid version' }));

        await expect(
            writer(fetchImpl).createDatapack({
                id: { name: 'justrite', version: 'v1' },
                displayName: 'J',
            })
        ).rejects.toThrow('Invalid version');
    });
});

describe('addDataItem', () => {
    it('POSTs add-data-item with the rows as a JSON string, and logs the route and status only', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(201, { success: true }));
        const log = jest.fn();
        const rows = [{ category: { name: 'Signs' } }];

        await writer(fetchImpl, log).addDataItem(
            { name: 'justrite', version: 'v1' },
            'categories',
            rows
        );

        const { url, body } = sent(fetchImpl);
        expect(url).toBe(`${BASE}/add-data-item`);
        expect(body).toEqual({
            datapack_name: 'justrite',
            version: 'v1',
            data_type: 'categories',
            data: JSON.stringify(rows),
        });
        expect(log).toHaveBeenCalledWith('add-data-item (categories) → 201');
        expect(JSON.stringify(log.mock.calls)).not.toContain('Signs');
    });

    it('names the type and says "too large" on a 413', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 413, text: async () => '' } as Response);

        const attempt = writer(fetchImpl).addDataItem({ name: 'j', version: 'v1' }, 'products', []);

        await expect(attempt).rejects.toBeInstanceOf(DataInstallerApiError);
        await expect(
            writer(fetchImpl).addDataItem({ name: 'j', version: 'v1' }, 'products', [])
        ).rejects.toThrow('products: too large to send in one request');
    });

    it('carries the store reason and status for any other refusal', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(reply(404, { success: false, error: 'Datapack not found' }));

        const error = await writer(fetchImpl)
            .addDataItem({ name: 'j', version: 'v1' }, 'categories', [])
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DataInstallerApiError);
        expect((error as DataInstallerApiError).message).toBe('categories: Datapack not found');
        expect((error as DataInstallerApiError).status).toBe(404);
    });
});

describe('deleteDatapack', () => {
    it('sends DELETE delete-datapack with the identity in the query, under the caller token', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(200, { success: true }));

        const result = await writer(fetchImpl).deleteDatapack({ name: 'justrite', version: 'v1' });

        expect(result).toBe('deleted');
        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/delete-datapack?datapack_name=justrite&version=v1`);
        expect(init.method).toBe('DELETE');
        expect(init.headers).toEqual({ Authorization: 'Bearer sc-token' });
        expect(init.body).toBeUndefined();
    });

    it('answers not-found on the store 404 — the library says the same for a pack the caller does not own', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(reply(404, { success: false, error: 'not found' }));

        await expect(writer(fetchImpl).deleteDatapack({ name: 'x', version: 'v1' })).resolves.toBe(
            'not-found'
        );
    });

    it('throws any other refusal with the store sentence', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(
                reply(500, { success: false, error: 'Could not delete the datapack.' })
            );

        await expect(
            writer(fetchImpl).deleteDatapack({ name: 'x', version: 'v1' })
        ).rejects.toThrow('Could not delete the datapack.');
    });
});

/**
 * Rename (step 07): the library's `update-datapack-metadata` is a PUT naming the pack and the
 * one field it changes, the display name. The pack's name is immutable there. Read from the
 * library's own action (accs-discovery-service `actions/update-datapack-metadata`), not captured
 * from a live response.
 */
describe('updateDisplayName', () => {
    it('sends PUT update-datapack-metadata with the identity and the new display name', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(200, { success: true }));

        await expect(writer(fetchImpl).updateDisplayName({ name: 'acme-1a2b3c', version: '20261029-183005' }, 'Acme Q4')).resolves.toBe('updated');

        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/update-datapack-metadata`);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(String(init.body))).toEqual({ datapack_name: 'acme-1a2b3c', version: '20261029-183005', display_name: 'Acme Q4' });
    });

    it('answers not-found on the 404 the library gives for a pack that is not the caller\'s', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(404, { success: false, error: 'not found' }));

        await expect(writer(fetchImpl).updateDisplayName({ name: 'x', version: '1' }, 'Y')).resolves.toBe('not-found');
    });
});

/**
 * With Adobe's gateway check on for the store's actions, a request that names no org is refused,
 * so every write names the caller's org as every read already does (DI-5).
 */
describe('the org a write names', () => {
    it('sends x-gw-ims-org-id beside the token on every write when the org is known', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply(200, { success: true }));
        const signed = new DatapackStoreWriter({
            baseUrl: BASE,
            getToken: async () => 'sc-token',
            orgCode: 'ORG@AdobeOrg',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await signed.deleteDatapack({ name: 'justrite', version: 'v1' });

        const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(init.headers).toEqual({ Authorization: 'Bearer sc-token', 'x-gw-ims-org-id': 'ORG@AdobeOrg' });
    });
});
