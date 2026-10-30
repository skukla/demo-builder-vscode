/**
 * Sharing a library pack (owner, 2026-10-30): every version of the SC's own pack is shared, or
 * stops being shared, through the library's owner-only `update-datapack-metadata` (`shared`).
 * Confirm-gated: shared, everyone with access to the datapack library can see and install it.
 */

// The shared wall first: it owns the access-guard mock and the subject's import.
import { STORE, datapackLibraryHandlers, mockAccess } from './datapackLibraryHandlers.testUtils';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { DatapackSummary } from '@/features/data-installer/types';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const share = datapackLibraryHandlers['share-library-datapack'];

const row = (version: string, mine: boolean): DatapackSummary => ({
    id: { name: 'acme-1a2b3c', version },
    displayName: 'Acme Demo',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    ...(mine ? { mine } : {}),
});

const library = { findDatapacks: jest.fn() };
let fetchMock: jest.Mock;

/** Each PUT the writer sent, as the body it carried. */
function puts(): unknown[] {
    return fetchMock.mock.calls
        .filter(([url, init]) => String(url) === `${STORE}/update-datapack-metadata` && (init as RequestInit).method === 'PUT')
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
    jest.clearAllMocks();
    library.findDatapacks.mockResolvedValue({ items: [row('20261028-090000', true), row('20261029-183005', true), row('theirs', false)], count: 3 });
    mockAccess.mockResolvedValue({ ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' });
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

it("is reachable through the panel's one handler map", () => {
    expect(importHandlers).toHaveProperty(['share-library-datapack']);
});

it("shares every version of the SC's own pack, and only those", async () => {
    const result = await share(createMockHandlerContext(), { datapackName: 'acme-1a2b3c', shared: true, confirm: true });

    expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
    expect(puts()).toEqual([
        { datapack_name: 'acme-1a2b3c', version: '20261028-090000', shared: true },
        { datapack_name: 'acme-1a2b3c', version: '20261029-183005', shared: true },
    ]);
    expect(result).toEqual({ success: true, data: { datapackName: 'acme-1a2b3c', shared: true, versions: 2 } });
});

it('stops sharing the same way', async () => {
    await share(createMockHandlerContext(), { datapackName: 'acme-1a2b3c', shared: false, confirm: true });

    expect(puts()).toEqual([
        { datapack_name: 'acme-1a2b3c', version: '20261028-090000', shared: false },
        { datapack_name: 'acme-1a2b3c', version: '20261029-183005', shared: false },
    ]);
});

it.each([
    ['no name', { shared: true, confirm: true }, 'Name the library datapack, and whether to share it.'],
    ['no shared', { datapackName: 'acme-1a2b3c', confirm: true }, 'Name the library datapack, and whether to share it.'],
])('refuses, writing nothing, with %s', async (_label, payload, error) => {
    expect(await share(createMockHandlerContext(), payload)).toEqual({ success: false, error });
    expect(fetchMock).not.toHaveBeenCalled();
});

it('refuses without confirm, saying who will see it', async () => {
    const result = await share(createMockHandlerContext(), { datapackName: 'acme-1a2b3c', shared: true });

    expect(result).toEqual({
        success: false,
        error: 'Everyone with access to the datapack library can see and install this pack. Send confirm:true to proceed.',
        code: ErrorCode.INVALID_OPERATION,
    });
    expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses a pack the SC does not own, writing nothing", async () => {
    library.findDatapacks.mockResolvedValue({ items: [row('theirs', false)], count: 1 });

    const result = await share(createMockHandlerContext(), { datapackName: 'acme-1a2b3c', shared: true, confirm: true });

    expect(result).toMatchObject({ success: false, error: 'The datapack library has no pack of yours named acme-1a2b3c.' });
    expect(puts()).toStrictEqual([]);
});
