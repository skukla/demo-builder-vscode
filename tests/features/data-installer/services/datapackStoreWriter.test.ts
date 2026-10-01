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
