/**
 * Marking a team pack (owner, 2026-11-03): a team pack is in everyone's default list; any other
 * shared pack is behind Include Community. Every version of the SC's own pack takes the mark,
 * through the store's owner-only `update-datapack-metadata` (`team`). The store refuses anyone not
 * on its deployed list of team pack owners, and that refusal reaches the caller.
 */

// The shared wall first: it owns the access-guard mock and the subject's import.
import { STORE, datapackLibraryHandlers, mockAccess } from './datapackLibraryHandlers.testUtils';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { DatapackSummary } from '@/features/data-installer/types';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const mark = datapackLibraryHandlers['mark-team-datapack'];

const row = (version: string, mine: boolean): DatapackSummary => ({
    id: { name: 'frescopa', version },
    displayName: 'Frescopa',
    shared: true,
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
    library.findDatapacks.mockResolvedValue({ items: [row('1.0.0', true), row('1.1.0', true), row('theirs', false)], count: 3 });
    mockAccess.mockResolvedValue({ ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' });
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

it("is reachable through the panel's one handler map", () => {
    expect(importHandlers).toHaveProperty(['mark-team-datapack']);
});

it.each([true, false])("sets team to %s on every version of the SC's own pack, and only those", async (team) => {
    const result = await mark(createMockHandlerContext(), { datapackName: 'frescopa', team });

    expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
    expect(library.findDatapacks).toHaveBeenCalledWith(expect.objectContaining({ datapackName: 'frescopa' }));
    expect(puts()).toEqual([
        { datapack_name: 'frescopa', version: '1.0.0', team },
        { datapack_name: 'frescopa', version: '1.1.0', team },
    ]);
    expect(result).toEqual({ success: true, data: { datapackName: 'frescopa', team, versions: 2 } });
});

it.each([
    ['no name', { team: true }],
    ['no team', { datapackName: 'frescopa' }],
    ['no payload', undefined],
])('refuses, asking nothing of the store, with %s', async (_label, payload) => {
    expect(await mark(createMockHandlerContext(), payload)).toEqual({
        success: false,
        error: 'Name the datapack, and say whether it is a team datapack.',
    });
    expect(mockAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
});

it('passes on the refusal when the store cannot be opened', async () => {
    const refusal = { success: false, error: 'Sign in with Adobe.', code: ErrorCode.AUTH_REQUIRED };
    mockAccess.mockResolvedValue({ ok: false, response: refusal });

    expect(await mark(createMockHandlerContext(), { datapackName: 'frescopa', team: true })).toEqual(refusal);
    expect(fetchMock).not.toHaveBeenCalled();
});

it('refuses a pack the SC does not own, writing nothing', async () => {
    library.findDatapacks.mockResolvedValue({ items: [row('theirs', false)], count: 1 });

    const result = await mark(createMockHandlerContext(), { datapackName: 'frescopa', team: true });

    expect(result).toEqual({
        success: false,
        error: "Demo Builder's datapack store has no datapack of yours named frescopa.",
        code: ErrorCode.INVALID_OPERATION,
    });
    expect(puts()).toHaveLength(0);
});

it("surfaces the store's refusal of someone not on its list of team pack owners", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 403, text: async () => '{"success":false,"error":"Only team pack owners can do this."}' }));

    const result = await mark(createMockHandlerContext(), { datapackName: 'frescopa', team: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only team pack owners can do this.');
    expect(result).not.toHaveProperty('data');
});
